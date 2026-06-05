# TEST_PLAN.md — Phase A Validation on Real Indian Listed Companies

**Spec:** v1.0 (frozen) · **Target:** Phase A (M0 + M1 + M4) · **Goal:** determine
whether the current implementation produces **analyst-grade** outputs on real
filings before investing in M2/M3.

---

## 1. Objective & scope

Validate the three things Phase A actually does:

1. **Guidance extraction** (LLM) — does it find the real forward-looking statements?
2. **Normalization (M1)** — are `metric_key`, `target_period`, `parsed_value`,
   `polarity` correct and machine-comparable?
3. **Revision detection (M1)** — does re-guidance correctly supersede the prior
   active statement with the right direction?
4. **Manual accountability loop (M4)** — can an analyst record outcomes, and does
   the credibility score recompute correctly (coverage, Provisional→Rated)?

### Explicitly OUT of scope (not built in Phase A)
- **Automated outcome detection / actuals extraction (M2)** and **resolution engine
  / auto-confirmation (M3).** No claim is tested about the engine *inferring*
  outcomes. Outcomes in Phase A are entered by a human; we test that the loop and
  the score are correct, not that the machine resolved them.
- Embedding/RAG quality and cost (separate workstream).

> **Pass of this plan = "the guidance ledger is accurate and the manual loop is
> trustworthy."** It is the prerequisite evidence for funding M2/M3.

---

## 2. Validation window

Use **FY2024 (Apr'23–Mar'24)** and **FY2025 (Apr'24–Mar'25)** — both fully elapsed
as of the test date, so *ground-truth actuals are knowable* and FY guidance can be
graded by a human. Within-year quarterly concalls also expose **mid-year revisions**
(critical for the revision-detection test).

---

## 3. Recommended companies (10)

Chosen to exercise every taxonomy family, all guidance types, both polarity
directions, TARGET_ATTAINMENT metrics, multi-year spans, and known real revisions.

| # | Company | Ticker (NSE) | Sector | Spec features exercised |
|---|---|---|---|---|
| 1 | Infosys | INFY | IT services | **Explicit FY revenue-growth band (CC %) + EBIT-margin band; mid-year guidance revisions** -> range guidance, `REVENUE_GROWTH`, `EBITDA/EBIT_MARGIN`, DOWNGRADE/UPGRADE |
| 2 | HDFC Bank | HDFCBANK | Bank | `NIM`, `COST_TO_INCOME`, `GROSS_NPA`, deposit/loan growth; LOWER_BETTER metrics |
| 3 | Bajaj Finance | BAJFINANCE | NBFC | `AUM_GROWTH`, `DISBURSEMENTS`, `CREDIT_COST`, `ROA`; medium-term ("long-range") guidance -> rolling horizon |
| 4 | UltraTech Cement | ULTRACEMCO | Cement/Mfg | `CAPACITY_ADD` (MTPA), `CAPEX`, `VOLUME_GROWTH`, `CAPACITY_UTILIZATION`; **TARGET_ATTAINMENT + multi-year span** |
| 5 | Maruti Suzuki | MARUTI | Auto | `VOLUME_GROWTH`, `CAPEX`, `EBITDA_MARGIN`; directional + quantitative mix |
| 6 | Titan Company | TITAN | Retail/Consumer | **Multi-year ("~2.5x by FY27") growth**, `SSSG`, `STORE_COUNT`, margins -> multi-year, TARGET_ATTAINMENT |
| 7 | Sun Pharma | SUNPHARMA | Pharma | `REVENUE_GROWTH`, R&D % of sales, specialty; **qualitative/directional** -> UNCLASSIFIED routing, `RM-NARRATIVE` |
| 8 | Tata Motors | TATAMOTORS | Auto | **"Net-auto-debt-free by FY25" target + repeated revisions**; `NET_DEBT` LOWER_BETTER, threshold, DOWNGRADE/UPGRADE |
| 9 | Reliance Industries | RELIANCE | Conglomerate | `CAPEX`, `NET_DEBT`, segment growth; largely **qualitative** outlook -> tests over-extraction/hallucination control |
| 10 | Avenue Supermarts (DMart) | DMART | Retail | `STORE_COUNT` adds, `REVENUE_GROWTH`, gross/EBITDA margin; TARGET_ATTAINMENT |

Sector coverage: IT, Bank, NBFC, Cement, Auto x2, Consumer x2, Pharma, Conglomerate.
INFY + TATAMOTORS are the **revision gold cases**; SUNPHARMA + RELIANCE are the
**false-positive/hallucination stress cases**.

---

## 4. Required documents per company

Two document classes:
- **(G) Guidance-bearing** — *ingested* into FinSight (extraction + normalization).
- **(A) Actuals/reference** — *read by the human* to record outcomes and to build
  ground truth. (Not ingested in Phase A; M2 will ingest these later.)

| Company | (G) Ingest — guidance docs | (A) Reference — for outcome scoring |
|---|---|---|
| INFY | Q1–Q4 **FY24** + Q1–Q4 **FY25** concall transcripts (guidance + revisions) | FY24 & FY25 results / annual report |
| HDFCBANK | Q1–Q4 FY24 concall transcripts; FY24 investor presentation | FY24 annual report, Q4FY24 results |
| BAJFINANCE | Q1–Q4 FY24 concalls + FY24 investor presentation | FY24 annual report, Q4FY24 results |
| ULTRACEMCO | Q1–Q4 FY24 concalls; capacity roadmap slides | FY24 annual report; capacity commissioning updates |
| MARUTI | Q1–Q4 FY24 concalls | FY24 annual report, Q4FY24 results |
| TITAN | Q1–Q4 FY24 concalls; analyst-meet / strategy presentation (multi-year) | FY24 + FY25 results (interim progress on multi-year) |
| SUNPHARMA | Q1–Q4 FY24 concalls | FY24 annual report, Q4FY24 results |
| TATAMOTORS | Q1–Q4 FY24 concalls (debt-free target + revisions) | FY24/FY25 results, net-auto-debt disclosures |
| RELIANCE | Q1–Q4 FY24 concalls + AGM transcript | FY24 annual report |
| DMART | Q1–Q4 FY24 concalls; store-count disclosures | FY24 annual report, Q4FY24 results |

**Minimum viable corpus:** >=4 consecutive concalls per company (to expose revisions)
+ >=1 reference actuals doc per elapsed FY. Sources: company investor-relations pages
and NSE/BSE filings. **Document provenance must be recorded** (URL + date) for audit.

---

## 5. Ground-truth ("golden set") construction

For each ingested document, a human analyst independently builds a labeled set
**before** looking at engine output:

- **Statement list:** every true forward-looking statement (the extraction oracle).
- Per statement: `true_metric_key`, `true_target_period` (canonical, e.g. `FY2025`,
  `FY2025-Q3`, `FY2025..FY2027`), `true_value_type`, `true_value` (low/high/unit),
  `true_polarity`.
- **Revision labels:** which statements supersede which (metric+period), and the
  true direction (UPGRADE/DOWNGRADE/REAFFIRMED).
- **Outcome labels:** for elapsed FY guidance, the realized actual + true outcome
  (met/missed/exceeded/revised) from the reference (A) docs.

Two analysts label independently on >=2 companies; report **inter-annotator
agreement (Cohen's kappa)** to bound ground-truth noise. kappa < 0.7 on a field means
that field's accuracy target is advisory, not pass/fail.

---

## 6. Evaluation methodology

Run per company; aggregate across the 10. For each ingested doc: ingest -> export the
normalized `guidance_statements` rows + `revision_events` -> diff against the golden set.

### 6.1 Extraction layer (LLM)
- Match engine statements to golden statements (semantic match on the quote/claim).
- Compute **recall**, **precision**, and **hallucination rate** (engine statements
  that are (a) past performance mis-tagged as guidance, or (b) fabricated/not in text).

### 6.2 Normalization layer (M1) — over correctly-extracted statements
- **metric_key accuracy** (on statements whose true metric is in the taxonomy) +
  **unclassified rate** (true-in-taxonomy but labeled `OTHER` = miss; true-not-in-taxonomy
  correctly `OTHER` = correct routing).
- **target_period accuracy** (exact canonical token match; partial credit logged for
  right-FY/wrong-segment).
- **value_type accuracy** and **parsed value correctness** (low/high/unit within the
  metric's tolerance band, Spec section 2). Evaluate the parser **standalone** (feed
  `value_given` text directly) AND **end-to-end**, to separate parser errors from
  extraction errors.
- **polarity accuracy** (deterministic from taxonomy -> expected ~100% for classified
  metrics; any miss implies a metric_key error).

### 6.3 Revision layer (M1)
- **Revision recall/precision** vs golden supersede pairs.
- **Direction accuracy** (UPGRADE/DOWNGRADE/REAFFIRMED).
- **False-supersede audit:** any case where a *distinct* active promise was wrongly
  marked superseded (i.e., a real commitment disappears from the active ledger).

### 6.4 Manual outcome loop (M4) — functional
- Record golden outcomes via the UI for >=5 statements/company.
- Verify: persistence; `method=analyst_confirmed`; `resolved_at` set; score recompute
  on save; **Provisional->Rated flips at exactly 5 resolved**; coverage = resolved/total.

### 6.5 Score integrity (M0)
- Hand-compute the expected credibility score (hit-rate, hedge-ratio, revision penalty,
  clamp) from the golden inputs; compare to engine output (must match within +/-0.01).

---

## 7. Success metrics (analyst-grade thresholds)

| Layer | Metric | Target (pass) | Stretch |
|---|---|---|---|
| Extraction | Guidance **recall** | >= 0.85 | >= 0.92 |
| Extraction | Guidance **precision** | >= 0.85 | >= 0.92 |
| Normalization | **metric_key** accuracy (classified) | >= 0.85 | >= 0.92 |
| Normalization | **target_period** accuracy | >= 0.90 | >= 0.95 |
| Normalization | **value_type** accuracy | >= 0.90 | >= 0.95 |
| Normalization | **parsed value** correctness (within tau) | >= 0.85 | >= 0.92 |
| Normalization | **polarity** accuracy (classified) | >= 0.98 | 1.00 |
| Revision | recall / precision | >= 0.85 / >= 0.90 | >= 0.92 / >= 0.95 |
| Revision | direction accuracy | >= 0.85 | >= 0.92 |
| Outcome loop | functional correctness | **100%** | 100% |
| Score | match vs hand-calc | **+/-0.01 (exact)** | exact |

**Analyst-grade bar (all must hold):** extraction recall >= 0.85 **and** metric_key
>= 0.85 **and** target_period >= 0.90 **and** parsed value >= 0.85 **and** score exact
**and zero critical failures** (section 8).

---

## 8. Failure metrics

### Critical failures (any single occurrence = engine NOT analyst-grade)
- **Polarity inversion** — a met is reported as missed (or vice-versa) because of
  wrong polarity/metric mapping. Directly corrupts the credibility verdict.
- **False supersede** — a distinct active commitment is hidden by revision detection
  (real promise vanishes from the ledger). Target rate **<= 2%**; any confirmed case
  of a *materially different* promise being hidden = critical.
- **Guidance hallucination** — fabricated guidance, or past results labeled as future
  guidance. Soft cap **<= 5%**; **> 10% = critical** (undermines the whole dataset).
- **Score miscomputation** — engine score != hand-calc beyond +/-0.01.
- **Wrong Provisional/Rated state** — score presented as "Rated" with < 5 resolved
  outcomes (overstates reliability).

### Quality failures (aggregate thresholds — fail if breached)
| Failure | Threshold |
|---|---|
| Extraction recall | < 0.85 (systematically misses real guidance) |
| metric_key accuracy | < 0.85 (ledger not reliably comparable) |
| target_period accuracy | < 0.90 (mis-grouping breaks promise->period linkage) |
| parsed value correctness | < 0.85 (numeric base unreliable for future auto-resolution) |
| Unclassified rate on in-taxonomy metrics | > 15% (taxonomy coverage gap) |
| Inter-annotator kappa on a field | < 0.7 -> that field's pass/fail is downgraded to advisory |

---

## 9. Go / No-Go decision

- **GO to M2** — all analyst-grade bars met, zero critical failures. The normalized
  ledger and manual loop are trustworthy enough to build auto-resolution on top.
- **CONDITIONAL** — one quality threshold missed by a small margin (<= 5%), no critical
  failures -> fix the specific layer (prompt for extraction; alias for metric_key;
  grammar for target_period) and re-test only that layer.
- **NO-GO** — any critical failure, or >= 2 quality thresholds breached -> halt M2;
  remediate Phase A. (Note: per frozen-spec rule, taxonomy/polarity/timeframe/
  confidence/resolution logic are only revisited if a **critical flaw** is proven
  here — e.g., a polarity definition that forces inversions.)

---

## 10. Execution checklist

1. Collect (G) + (A) docs for all 10 companies; record provenance.
2. Build golden sets (2-analyst dual-label on INFY + TATAMOTORS for kappa).
3. Apply migration `001_accountability_schema.sql` to a clean test DB.
4. Ingest (G) docs in chronological order (enables revision detection).
5. Export normalized rows + `revision_events`; run section 6 diffs; tabulate 7/8.
6. Execute section 6.4 manual-loop test on >=5 statements/company.
7. Verify section 6.5 score integrity.
8. Record results in a results matrix; apply section 9 decision.

---

## 11. Risks & confounders

- **Document quality:** scanned/OCR'd concalls degrade extraction — test only on clean
  text PDFs; log any OCR docs separately.
- **Ground-truth subjectivity:** "is this forward-looking?" is judgment — mitigated by
  dual-labeling + kappa reporting.
- **Provider variance:** extraction runs on the current LLM; record model + date.
  Because Phase A is provider-agnostic, re-run on the eventual Ollama model to confirm
  thresholds hold before relying on them post-migration.
- **Tolerance calibration:** value-correctness uses Spec section 2 tau bands; borderline
  numeric cases should be logged, not silently passed/failed.
- **Scope creep:** resist grading the engine on *outcome inference* — that is M2/M3 and
  must not contaminate Phase A pass/fail.

---

### Deliverable of this test
A results matrix (10 companies x the section 7/8 metrics) plus a one-line **GO /
CONDITIONAL / NO-GO** verdict, providing the evidence base for whether to proceed to M2.
