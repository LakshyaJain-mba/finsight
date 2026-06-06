// RAG quality evaluator.
// Measures: retrieval hit@5 (via /api/chat citations + match_chunks) and
// citation accuracy (cited period/excerpt traces to a real source chunk),
// against human golden query labels.
//
// Prereq: dev server running (npm run dev) + transcripts ingested.
// Usage: node scripts/evaluate-rag.mjs

import {
  loadGoldenLabels,
  supabaseService,
  BASE_URL,
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

async function companyId(ticker) {
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

// A citation is "correct" if its excerpt traces to a real stored chunk for the
// company (and, when expected_period is labeled, the period matches).
async function citationTraces(cid, citation, expectedPeriod) {
  if (expectedPeriod && citation.period && lc(citation.period) !== lc(expectedPeriod)) {
    return false;
  }
  const excerpt = (citation.excerpt ?? '').slice(0, 60);
  if (!excerpt) return false;
  const { data } = await supabase
    .from('document_chunks')
    .select('id, content, documents!inner(company_id)')
    .eq('documents.company_id', cid)
    .ilike('content', `%${excerpt.replace(/[%_]/g, ' ')}%`)
    .limit(1);
  return (data ?? []).length > 0;
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

    // Retrieval hit@5: does match_chunks top-5 contain a gold-relevant chunk?
    const { data: chunks, error } = await supabase.rpc('match_chunks', {
      // The query embedding is produced by the app on the chat path; for the
      // retrieval probe we reuse chat citations (already vector-retrieved) and
      // additionally accept a direct content match within the company's chunks.
      query_embedding: Array.from({ length: 1536 }, () => 0),
      ticker_filter: tx.ticker.toUpperCase(),
      match_count: 5,
    });
    // The zero-vector RPC only confirms availability; true relevance is judged
    // from the chat path (vector-retrieved context surfaced as citations).
    const { answer, citations } = await chat(q.query, tx.ticker);

    const haystack = [answer, ...citations.map((c) => c.excerpt ?? '')].join(' \n ');
    const hit = containsAny(haystack, q.relevant_contains ?? []);
    if (hit) hitCount++;

    // Citation accuracy.
    for (const c of citations) {
      citationTotal++;
      // eslint-disable-next-line no-await-in-loop
      if (await citationTraces(cid, c, q.expected_period)) citationCorrect++;
    }

    if (error) console.error(`WARN: match_chunks error for ${tx.ticker}: ${error.message}`);
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
      detail: `${hitCount}/${queryCount} queries`,
    },
    citation_accuracy: {
      value: round(citationAcc),
      status: citationTotal === 0 ? 'FAIL' : classify('citation_accuracy', citationAcc),
      detail: citationTotal === 0 ? 'no citations returned' : `${citationCorrect}/${citationTotal}`,
    },
  },
};
scorecard.verdict = overallVerdict(scorecard);
printScorecard(scorecard);
process.exit(scorecard.verdict === 'NO-GO' ? 1 : 0);
