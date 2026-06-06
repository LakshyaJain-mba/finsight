# Golden Dataset Plan — FinSight Evaluation (v0, 5 transcripts)

Smallest high-signal benchmark. Each transcript targets a distinct guidance
behavior; together they cover the 5 required cases with minimal labeling cost.

## Transcript selection (5)

| # | Company | Period | Sector | Case covered | Complexity | Why it belongs |
|---|---|---|---|---|---|---|
| 1 | Infosys (INFY) | Q3FY25 | IT services | **Guidance revision** | High | INFY narrows/changes its FY revenue-growth CC band intra-year — the canonical supersede + direction test |
| 2 | Tata Motors (TATAMOTORS) | Q2FY25 | Auto | **Guidance raise (UPGRADE)** | Med | Improving net-debt/deleverage trajectory raised vs prior — UPGRADE + LOWER_BETTER polarity |
| 3 | Asian Paints (ASIANPAINT) | Q2FY25 | Consumer | **Guidance cut (DOWNGRADE)** | Med | Demand-driven margin/volume guidance lowered — DOWNGRADE on HIGHER_BETTER |
| 4 | UltraTech (ULTRACEMCO) | Q2FY25 | Cement | **Quantitative target** | High | Multi-year capacity (MTPA) + capex plan — TARGET_ATTAINMENT, multi-year target_period |
| 5 | Sun Pharma (SUNPHARMA) | Q2FY25 | Pharma | **Qualitative guidance** | Low | Specialty/"premiumisation" outlook with no numbers — qualitative routing + non-grading |

Selection rules: elapsed periods only (actuals knowable); #1 requires its prior
period (e.g. Q2FY25) ingested too so a revision can be detected; clean text PDFs/
transcripts only (no OCR).

## 1. Label schema (data/golden_labels.json)

Conforms to data/golden_labels.example.json. Per transcript:

```jsonc
{
  "version": "v0",                  // must NOT be EXAMPLE-DO-NOT-USE
  "transcripts": [{
    "ticker": "INFY",
    "period": "Q3FY25",             // as ingested
    "doc_type": "concall",
    "source_file": "data/transcripts/infy_q3fy25.txt",
    "guidance": [{
      "metric_key": "REVENUE_GROWTH",          // canonical key from lib/taxonomy.ts (or OTHER)
      "target_period": "FY2025",               // FY2025 | FY2025-Q3 | FY2025-H1 | FY2025..FY2027
      "value_type": "range",                   // point|range|threshold|directional|qualitative
      "polarity": "HIGHER_BETTER",
      "statement_contains": ["revenue growth", "constant currency"]  // substrings the extraction must contain
    }],
    "revisions": [{                            // expected supersede events
      "metric_key": "REVENUE_GROWTH",
      "target_period": "FY2025",
      "direction": "DOWNGRADE"                 // UPGRADE|DOWNGRADE|REAFFIRMED
    }],
    "queries": [{                              // RAG probes
      "query": "What is FY25 revenue growth guidance?",
      "relevant_contains": ["revenue growth"], // chunk relevant if it contains ANY
      "expected_period": "Q3FY25"              // period a correct citation should cite
    }]
  }]
}
```

Field rules: metric_key/polarity from the frozen taxonomy; target_period
canonical (Indian FY); statement_contains = minimal unique substrings (avoid
over-constraining); >=2 queries per transcript, >=1 with expected_period.

## 2. Human labeling instructions

Per transcript, label **only what management explicitly states about the future**:

1. **Read once**; mark every forward-looking statement (ignore analyst Q&A, past results).
2. For each: set metric_key (taxonomy; else OTHER), target_period (canonical), value_type, polarity (from taxonomy — don't invent), and 1-3 short statement_contains substrings copied verbatim.
3. **Revisions**: only if this transcript changes guidance on a (metric_key, target_period) stated earlier. Set direction by polarity-aware comparison (better->UPGRADE, worse->DOWNGRADE, same->REAFFIRMED).
4. **Qualitative** items: value_type "qualitative", no numeric value; they are NOT auto-graded (expected to route to review).
5. **Queries**: write 2-3 real analyst questions; relevant_contains = words that must appear in a correct source chunk; expected_period = the doc that should be cited.
6. Dual-label #1 and #3 (two labelers) and reconcile; report disagreements.

Quality bar: a second analyst must be able to reproduce a label from the transcript alone.

## 3. Estimated labeling time

| Complexity | Transcripts | Per transcript | Subtotal |
|---|---|---|---|
| Low | #5 | ~20 min | 20 min |
| Med | #2, #3 | ~35 min | 70 min |
| High | #1, #4 | ~50 min | 100 min |
| Dual-label overhead | #1, #3 | +50% each | ~40 min |

**Total ~= 3.5-4 hours** for the 5-transcript v0 set (incl. reconciliation).

## 4. Evaluation workflow

```bash
# 0. Label
cp data/golden_labels.example.json data/golden_labels.json   # then hand-label all 5

# 1. Ingest the 5 transcripts (incl. INFY prior period for the revision case)
#    via the Upload UI or /api/process-document, using the exact ticker+period in labels.

# 2. Static gate first (plumbing): chunks/dim/match/citations exist
node scripts/validate-rag.mjs

# 3. Quality evals (need .env.local + ingested data; RAG needs `npm run dev`)
node scripts/evaluate-extraction.mjs     # extraction F1, timeframe, duplicate/revision
npm run dev &                            # for the chat path
node scripts/evaluate-rag.mjs            # retrieval hit@5, citation accuracy
```

Each script prints per-metric PASS/CONDITIONAL/FAIL, a JSON_SCORECARD {...} line,
and an aggregate verdict (GO / CONDITIONAL / NO-GO) per EVALUATION_FRAMEWORK.md
thresholds; exit 1 on NO-GO.

**Acceptance for v0:** GO on both scorecards, zero critical failures
(polarity inversion, false supersede, bad citation). Then scale to 20.

## Coverage check

| Required case | Transcript |
|---|---|
| guidance revision | #1 INFY |
| guidance raise | #2 TATAMOTORS |
| guidance cut | #3 ASIANPAINT |
| quantitative target | #4 ULTRACEMCO |
| qualitative guidance | #5 SUNPHARMA |

> Company/period picks are illustrative of the *behavior* each slot must exercise;
> swap any name for one you can source as clean text, as long as the case (column 5)
> still holds. Do not label from memory — label from the actual transcript.
