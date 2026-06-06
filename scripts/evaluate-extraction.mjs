// Extraction quality evaluator.
// Measures: extraction recall (+ precision/F1 only when labels are exhaustive),
// timeframe accuracy, duplicate/revision detection — against human golden labels.
//
// R1: precision is only scored for transcripts explicitly marked
//     "is_complete": true (every real statement labeled). Otherwise unmatched
//     extractions are NOT counted as false positives; we report recall and the
//     count of extra (unlabeled) extractions separately.
// R3: CRITICAL detectors force NO-GO:
//     - polarity_inversion: extracted polarity contradicts the golden polarity
//       for a matched statement (would flip met/missed).
//     - false_supersede: a recorded revision marked a DISTINCT active promise
//       (different metric_key+target_period than its successor) as superseded.
//
// Prereq: ingest the labeled transcripts first; run against the live DB.
// Usage: node scripts/evaluate-extraction.mjs

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

let truePos = 0;
let goldenTotal = 0;
let extractedComplete = 0; // denominator for precision: only is_complete transcripts
let extraUnlabeled = 0; // unmatched extractions in non-complete transcripts (reported, not penalised)
let timeframeCorrect = 0;
let timeframeApplicable = 0;
let revHit = 0;
let revGoldenTotal = 0;
let revDirCorrect = 0;
let revPredTotal = 0;
const criticalFailures = [];

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

  const { data: stmts } = await supabase
    .from('guidance_statements')
    .select('statement, metric_key, target_period, polarity, is_active')
    .eq('company_id', cid)
    .eq('period', tx.period);
  const extracted = (stmts ?? []).filter((s) => s.is_active !== false);

  // R1: only count toward precision when the transcript is exhaustively labeled.
  const isComplete = tx.is_complete === true;
  if (isComplete) extractedComplete += extracted.length;

  const used = new Set();
  for (const g of tx.guidance ?? []) {
    goldenTotal++;
    const subs = g.statement_contains ?? [];
    const candidates = extracted
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e, i }) =>
          !used.has(i) &&
          lc(e.metric_key) === lc(g.metric_key) &&
          (subs.length === 0 || containsAll(e.statement, subs))
      );
    const preferred =
      candidates.find(({ e }) => lc(e.target_period) === lc(g.target_period)) ?? candidates[0];
    if (preferred) {
      used.add(preferred.i);
      truePos++;

      // Timeframe accuracy on matched items.
      if (g.target_period) {
        timeframeApplicable++;
        if (lc(preferred.e.target_period) === lc(g.target_period)) timeframeCorrect++;
      }

      // R3 CRITICAL: polarity inversion on a matched statement.
      if (g.polarity && preferred.e.polarity && lc(preferred.e.polarity) !== lc(g.polarity)) {
        criticalFailures.push({
          type: 'polarity_inversion',
          detail: `${tx.ticker} ${g.metric_key}: extracted polarity ${preferred.e.polarity} != golden ${g.polarity}`,
        });
      }
    }
  }

  // R1: extra (unlabeled) extractions in non-complete transcripts — reported only.
  if (!isComplete) extraUnlabeled += extracted.length - used.size;

  // Revision detection.
  const goldenRevs = tx.revisions ?? [];
  revGoldenTotal += goldenRevs.length;
  const { data: revs } = await supabase
    .from('revision_events')
    .select(
      'direction, original_id, successor_id, ' +
        'orig:guidance_statements!revision_events_original_id_fkey(metric_key, target_period), ' +
        'succ:guidance_statements!revision_events_successor_id_fkey(metric_key, target_period, period, company_id)'
    )
    .limit(500);
  const predForTx = (revs ?? []).filter((r) => {
    const s = r.succ;
    return s && s.company_id === cid && lc(s.period) === lc(tx.period);
  });
  revPredTotal += predForTx.length;

  // R3 CRITICAL: false supersede — original and successor describe DIFFERENT
  // commitments (different metric_key or target_period). A real promise hidden.
  for (const r of predForTx) {
    const o = r.orig;
    const s = r.succ;
    if (o && s && (lc(o.metric_key) !== lc(s.metric_key) || lc(o.target_period) !== lc(s.target_period))) {
      criticalFailures.push({
        type: 'false_supersede',
        detail: `${tx.ticker}: superseded ${o.metric_key}/${o.target_period} with unrelated ${s.metric_key}/${s.target_period}`,
      });
    }
  }

  for (const gr of goldenRevs) {
    const hit = predForTx.find(
      (r) =>
        lc(r.succ?.metric_key) === lc(gr.metric_key) &&
        lc(r.succ?.target_period) === lc(gr.target_period)
    );
    if (hit) {
      revHit++;
      if (lc(hit.direction) === lc(gr.direction)) revDirCorrect++;
    }
  }
}

const recall = goldenTotal ? truePos / goldenTotal : 0;

// R1: F1 only meaningful when at least one transcript is exhaustively labeled.
const anyComplete = labels.transcripts.some((t) => t.is_complete === true);
const precision = extractedComplete ? truePos / extractedComplete : null;
const extractionF1 = precision != null ? f1(precision, recall) : null;

const timeframeAcc = timeframeApplicable ? timeframeCorrect / timeframeApplicable : 0;

// R5-lite: revision metric is n/a (not a vacuous PASS) when nothing is labeled.
const revRecall = revGoldenTotal ? revHit / revGoldenTotal : null;
const revPrecision = revGoldenTotal && revPredTotal ? revHit / revPredTotal : null;
const dupScore =
  revRecall != null && revPrecision != null ? (revRecall + revPrecision) / 2 : null;

const metrics = {};
if (anyComplete && extractionF1 != null) {
  metrics.extraction_f1 = {
    value: round(extractionF1),
    status: classify('extraction_f1', extractionF1),
    detail: `precision=${round(precision)} recall=${round(recall)} (precision over is_complete transcripts)`,
  };
} else {
  // R1: no exhaustive labels -> report recall (not a biased F1); note extras.
  metrics.extraction_recall = {
    value: round(recall),
    status: classify('extraction_recall', recall),
    detail: `recall only; ${extraUnlabeled} extra unlabeled extraction(s) not penalised (set "is_complete": true to score precision)`,
  };
}
metrics.timeframe_accuracy = {
  value: round(timeframeAcc),
  status: timeframeApplicable ? classify('timeframe_accuracy', timeframeAcc) : 'CONDITIONAL',
  detail: `${timeframeCorrect}/${timeframeApplicable} matched items`,
};
if (dupScore != null) {
  metrics.duplicate_detection = {
    value: round(dupScore),
    status: classify('duplicate_detection', dupScore),
    detail: `recall=${round(revRecall)} precision=${round(revPrecision)} dir_correct=${revDirCorrect}/${revHit}`,
  };
} else {
  metrics.duplicate_detection = {
    value: null,
    status: 'N/A',
    detail: 'no golden revisions labeled — excluded from verdict',
  };
}

const scorecard = {
  kind: 'extraction',
  generated_at: new Date().toISOString(),
  counts: {
    goldenTotal,
    truePos,
    extractedComplete,
    extraUnlabeled,
    timeframeApplicable,
    timeframeCorrect,
    revGoldenTotal,
    revPredTotal,
    revHit,
    revDirCorrect,
  },
  metrics,
  critical_failures: criticalFailures,
};

// N/A statuses must not count as FAIL in the verdict.
for (const m of Object.values(scorecard.metrics)) {
  if (m.status === 'N/A') m.status = 'PASS_NA';
}
scorecard.verdict = overallVerdict(scorecard);
printScorecard(scorecard);
process.exit(scorecard.verdict === 'NO-GO' ? 1 : 0);
