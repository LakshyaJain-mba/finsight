# Evaluation Framework — RAG + Guidance Extraction

Validates analyst-grade quality across **7 earnings-call transcripts**. Each is
labeled by a human (golden set) before comparison. Provider-agnostic (Gemini today).

## Corpus (7 transcripts)

Pick 7 elapsed-period concalls spanning ≥2 companies and ≥2 consecutive quarters
for the same company (required for duplicate/revision tests).

| # | Company | Period | Exercises |
|---|---|---|---|
| 1 | INFY | Q2FY25 | range guidance, revenue/margin |
| 2 | INFY | Q3FY25 | revision vs #1 (same metric+FY) |
| 3 | TATAMOTORS | Q2FY25 | threshold (net-debt), LOWER_BETTER |
| 4 | ULTRACEMCO | Q2FY25 | TARGET_ATTAINMENT, multi-year capex |
| 5 | HDFCBANK | Q2FY25 | NIM/GNPA, banking metrics |
| 6 | SUNPHARMA | Q2FY25 | qualitative -> UNCLASSIFIED routing |
| 7 | MARUTI | Q2FY25 | directional + quantitative mix |

## Metrics, scoring rubric, thresholds

Per metric: score = correct / applicable (golden-labeled). Aggregate across all 7.

| Metric | Definition | Scoring | PASS | FAIL |
|---|---|---|---|---|
| **Guidance extraction accuracy** | Found guidance vs golden | F1 (recall x precision) over matched statements | **>=0.85** | <0.80 |
| **Duplicate/revision detection** | Same (metric_key, target_period) superseded + correct direction | (recall+precision)/2; dir accuracy | **>=0.85** | <0.80 |
| **Timeframe accuracy** | `target_period` canonical token exact match | exact / applicable | **>=0.90** | <0.85 |
| **Retrieval relevance** | Top-5 `match_chunks` contains a gold-relevant chunk | hit@5 (mean over queries) | **>=0.80** | <0.70 |
| **Citation accuracy** | Cited period/excerpt traces to a real source chunk | correct / total citations | **>=0.90** | <0.85 |
| **Answer grounding** | Every answer claim supported by retrieved context | grounded claims / total claims | **>=0.90** | <0.85 |

**Critical (any one => overall FAIL regardless of scores):**
- Polarity inversion (met<->missed)
- False supersede hiding a distinct active promise
- Citation pointing to a non-existent/wrong source
- Hallucinated claim with a fabricated citation

## Test matrix (metric x transcript)

Record P/F (or score) per cell; a metric passes only if the **aggregate** clears its threshold.

| Metric \ Tx | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Agg |
|---|---|---|---|---|---|---|---|---|
| Extraction acc | | | | | | | | |
| Dup/revision | | | | | | | | |
| Timeframe acc | | | | | | | | |
| Retrieval rel | | | | | | | | |
| Citation acc | | | | | | | | |
| Answer grounding | | | | | | | | |

## Procedure

1. Build golden labels per transcript (statements, metric_key, target_period, value, revision pairs, >=3 query->relevant-chunk pairs, expected answers).
2. Ingest all 7 (`/api/process-document`); export `guidance_statements` + `revision_events`.
3. Diff vs golden -> extraction, duplicate, timeframe.
4. Run query set -> `match_chunks` (retrieval), `/api/chat` (citation + grounding).
5. Fill matrix; apply thresholds + critical-failure gate.

## Verdict

- **GO** — all 6 metrics >= PASS, zero critical failures.
- **CONDITIONAL** — one metric in (FAIL, PASS) band, no critical failures -> fix that layer, re-test only it.
- **NO-GO** — any metric < FAIL, or any critical failure.

> Static harness (`scripts/validate-rag.mjs`) covers plumbing (chunks/dim/match/citations exist).
> This framework adds the **quality** layer (accuracy/relevance/grounding) requiring human golden
> labels — provider runs must record model + date for reproducibility.
