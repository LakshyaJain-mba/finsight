// Extraction quality evaluator.
// Measures: extraction precision/recall/F1, timeframe accuracy,
// duplicate/revision detection — against human golden labels.
//
// Prereq: ingest the labeled transcripts first (upload them so guidance_statements
// + revision_events exist), then run this against the live DB.
//
// Usage: node scripts/evaluate-extraction.mjs
//   GOLDEN_LABELS=data/golden_labels.json (default)

import {
  loadGoldenLabels,
  supabaseService,
  containsAll,
  lc,
  f1,
  round,
  classify,
  overallVerdict,
  printScorecard,
} from './eval-common.mjs';

const labels = loadGoldenLabels();
const supabase = supabaseService();

// Tallies across all transcripts.
let truePos = 0; // golden guidance matched by an extraction
let goldenTotal = 0; // total golden guidance
let extractedTotal = 0; // total extracted (active) statements considered
let timeframeCorrect = 0;
let timeframeApplicable = 0;
let revHit = 0;
let revGoldenTotal = 0;
let revDirCorrect = 0;
let revPredTotal = 0; // predicted revisions (for precision)

async function companyId(ticker) {
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

for (const tx of labels.transcripts) {
  const cid = await companyId(tx.ticker);
  if (!cid) {
    console.error(`WARN: company ${tx.ticker} not found — ingest transcripts first. Skipping.`);
    continue;
  }

  // Extracted statements for this company+period (active only).
  const { data: stmts } = await supabase
    .from('guidance_statements')
    .select('statement, metric_key, target_period, is_active')
    .eq('company_id', cid)
    .eq('period', tx.period);
  const extracted = (stmts ?? []).filter((s) => s.is_active !== false);
  extractedTotal += extracted.length;

  // Match each golden statement to an extraction (metric_key + target_period +
  // statement_contains substrings). One extraction matches at most one golden.
  const used = new Set();
  for (const g of tx.guidance ?? []) {
    goldenTotal++;
    const idx = extracted.findIndex((e, i) => {
      if (used.has(i)) return false;
      if (lc(e.metric_key) !== lc(g.metric_key)) return false;
      const subs = g.statement_contains ?? [];
      return subs.length === 0 || containsAll(e.statement, subs);
    });
    if (idx !== -1) {
      used.add(idx);
      truePos++;
      // Timeframe accuracy on matched items.
      if (g.target_period) {
        timeframeApplicable++;
        if (lc(extracted[idx].target_period) === lc(g.target_period)) timeframeCorrect++;
      }
    }
  }

  // Revision detection: compare golden revisions to recorded revision_events
  // whose successor is a statement of this transcript's period.
  const goldenRevs = tx.revisions ?? [];
  revGoldenTotal += goldenRevs.length;
  if (goldenRevs.length > 0 || true) {
    const { data: revs } = await supabase
      .from('revision_events')
      .select('direction, successor_id, guidance_statements!revision_events_successor_id_fkey(metric_key, target_period, period, company_id)')
      .limit(500);
    const predForTx = (revs ?? []).filter((r) => {
      const s = r.guidance_statements;
      return s && s.company_id === cid && lc(s.period) === lc(tx.period);
    });
    revPredTotal += predForTx.length;
    for (const gr of goldenRevs) {
      const hit = predForTx.find(
        (r) =>
          lc(r.guidance_statements?.metric_key) === lc(gr.metric_key) &&
          lc(r.guidance_statements?.target_period) === lc(gr.target_period)
      );
      if (hit) {
        revHit++;
        if (lc(hit.direction) === lc(gr.direction)) revDirCorrect++;
      }
    }
  }
}

const recall = goldenTotal ? truePos / goldenTotal : 0;
const precision = extractedTotal ? truePos / extractedTotal : 0;
const extractionF1 = f1(precision, recall);
const timeframeAcc = timeframeApplicable ? timeframeCorrect / timeframeApplicable : 0;
const revRecall = revGoldenTotal ? revHit / revGoldenTotal : 1;
const revPrecision = revPredTotal ? revHit / revPredTotal : 1;
const dupScore = (revRecall + revPrecision) / 2;

const scorecard = {
  kind: 'extraction',
  generated_at: new Date().toISOString(),
  counts: {
    goldenTotal,
    extractedTotal,
    truePos,
    timeframeApplicable,
    timeframeCorrect,
    revGoldenTotal,
    revPredTotal,
    revHit,
    revDirCorrect,
  },
  metrics: {
    extraction_f1: {
      value: round(extractionF1),
      status: classify('extraction_f1', extractionF1),
      detail: `precision=${round(precision)} recall=${round(recall)}`,
    },
    timeframe_accuracy: {
      value: round(timeframeAcc),
      status: classify('timeframe_accuracy', timeframeAcc),
    },
    duplicate_detection: {
      value: round(dupScore),
      status: classify('duplicate_detection', dupScore),
      detail: `recall=${round(revRecall)} precision=${round(revPrecision)} dir_correct=${revDirCorrect}/${revHit}`,
    },
  },
};
scorecard.verdict = overallVerdict(scorecard);
printScorecard(scorecard);
process.exit(scorecard.verdict === 'NO-GO' ? 1 : 0);
