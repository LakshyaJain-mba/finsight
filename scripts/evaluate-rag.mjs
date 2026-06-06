// RAG quality evaluator.
// Measures:
//  - retrieval hit@5: computed from ACTUAL match_chunks rows for a REAL query
//    embedding (R2). The LLM answer text is NOT part of the hit decision.
//  - citation accuracy: each chat citation must trace to a real retrieved chunk.
//  - CRITICAL: fabricated citation (cites content that exists in no chunk) forces NO-GO (R3).
//
// Prereq: dev server running (npm run dev) + transcripts ingested + GEMINI_API_KEY.
// Usage: node scripts/evaluate-rag.mjs

import {
  loadGoldenLabels,
  supabaseService,
  BASE_URL,
  embedQuery,
  containsAny,
  lc,
  round,
  classify,
  overallVerdict,
  printScorecard,
} from './eval-common.mjs';

const CITATIONS_MARKER = '\n__FINSIGHT_CITATIONS__\n';
const labels = loadGoldenLabels();
const supabase = supabaseService();

let hitCount = 0;
let queryCount = 0;
let citationCorrect = 0;
let citationTotal = 0;
const criticalFailures = [];

async function companyId(ticker) {
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

// Does a citation excerpt trace to a real chunk for this company?
// Returns { traced: boolean, periodMismatch: boolean }.
async function traceCitation(cid, citation, expectedPeriod) {
  const excerpt = (citation.excerpt ?? '').trim().slice(0, 80);
  if (!excerpt) return { traced: false, periodMismatch: false };
  // Normalise whitespace for a more robust contains-match.
  const needle = excerpt.replace(/\s+/g, ' ').replace(/[%_]/g, ' ').slice(0, 60);
  const { data } = await supabase
    .from('document_chunks')
    .select('id, documents!inner(company_id, period)')
    .eq('documents.company_id', cid)
    .ilike('content', `%${needle}%`)
    .limit(1);
  const traced = (data ?? []).length > 0;
  const periodMismatch =
    traced && expectedPeriod && citation.period && lc(citation.period) !== lc(expectedPeriod);
  return { traced, periodMismatch };
}

async function chat(query, ticker) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, company_ticker: ticker, history: [] }),
  });
  const text = await res.text();
  const idx = text.indexOf(CITATIONS_MARKER);
  const answer = idx === -1 ? text : text.slice(0, idx);
  let citations = [];
  if (idx !== -1) {
    try {
      citations = JSON.parse(text.slice(idx + CITATIONS_MARKER.length));
    } catch {
      citations = [];
    }
  }
  return { answer, citations };
}

for (const tx of labels.transcripts) {
  const cid = await companyId(tx.ticker);
  if (!cid) {
    console.error(`WARN: company ${tx.ticker} not found — ingest transcripts first. Skipping.`);
    continue;
  }
  for (const q of tx.queries ?? []) {
    queryCount++;

    // R2: REAL retrieval. Embed the query like the app does, then read the
    // top-5 chunks from match_chunks. hit@5 is judged ONLY from these rows.
    let retrievedContents = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      const embedding = await embedQuery(q.query);
      // eslint-disable-next-line no-await-in-loop
      const { data: chunks, error } = await supabase.rpc('match_chunks', {
        query_embedding: embedding,
        ticker_filter: tx.ticker.toUpperCase(),
        match_count: 5,
      });
      if (error) console.error(`WARN: match_chunks error for ${tx.ticker}: ${error.message}`);
      retrievedContents = (chunks ?? []).map((c) => c.content ?? '');
    } catch (e) {
      console.error(`WARN: query embedding failed: ${e.message}`);
    }
    const hit = containsAny(retrievedContents.join(' \n '), q.relevant_contains ?? []);
    if (hit) hitCount++;

    // Citation accuracy + fabricated-citation critical check (R3) from chat.
    // eslint-disable-next-line no-await-in-loop
    const { citations } = await chat(q.query, tx.ticker);
    for (const c of citations) {
      citationTotal++;
      // eslint-disable-next-line no-await-in-loop
      const { traced, periodMismatch } = await traceCitation(cid, c, q.expected_period);
      if (traced && !periodMismatch) citationCorrect++;
      if (!traced) {
        criticalFailures.push({
          type: 'fabricated_citation',
          detail: `${tx.ticker} "${q.query}": citation excerpt not found in any chunk: "${(c.excerpt ?? '').slice(0, 60)}"`,
        });
      }
    }
  }
}

const hitAt5 = queryCount ? hitCount / queryCount : 0;
const citationAcc = citationTotal ? citationCorrect / citationTotal : 0;

const scorecard = {
  kind: 'rag',
  generated_at: new Date().toISOString(),
  counts: { queryCount, hitCount, citationTotal, citationCorrect },
  metrics: {
    retrieval_hit_at_5: {
      value: round(hitAt5),
      status: classify('retrieval_hit_at_5', hitAt5),
      detail: `${hitCount}/${queryCount} queries (from match_chunks rows only)`,
    },
    citation_accuracy: {
      value: round(citationAcc),
      status: citationTotal === 0 ? 'FAIL' : classify('citation_accuracy', citationAcc),
      detail: citationTotal === 0 ? 'no citations returned' : `${citationCorrect}/${citationTotal}`,
    },
  },
  critical_failures: criticalFailures,
};
scorecard.verdict = overallVerdict(scorecard);
printScorecard(scorecard);
process.exit(scorecard.verdict === 'NO-GO' ? 1 : 0);
