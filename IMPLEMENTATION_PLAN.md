# Guidance Accountability Engine — Implementation Plan

**Spec version:** v1.0 (frozen)
**Objective:** Build the intelligence layer defined in Spec v1.0 (metric taxonomy, polarity, timeframe grammar, resolution rules, confidence scoring) in the smallest increments that each deliver independently testable value.

---

## Milestone Map

```
M0 ──→ M1 ──→ M2 ──→ M3 ──→ M4
Schema   Norm.   Actuals   Resolution   Review
+ Types  + LLM   Extract   Engine       Queue
         Enrich                          + Score
```

| Milestone | Deliverable | Prerequisite | Estimated effort |
|---|---|---|---|
| **M0** | Schema evolution + types + metric taxonomy config | None | 1 day |
| **M1** | Normalization layer (guidance enrichment on ingest) | M0 | 2 days |
| **M2** | Actuals extraction pass (new LLM call on ingest of results/reports) | M0, M1 | 2 days |
| **M3** | Resolution engine (match, compare, score, gate) | M0, M1, M2 | 3 days |
| **M4** | Review queue + analyst override + score recompute + UI | M3 | 2 days |

**Total:** ~10 dev-days.
**Smallest useful milestone:** M0+M1+M4 (skip auto-actuals, manual-only entry with enriched data) = 5 days. This delivers working Guidance Accountability immediately and the later milestones (M2, M3) upgrade it to hybrid-auto without rework.

---

## M0 — Schema evolution + types + configuration registry

**Goal:** Lay the data foundation. No runtime changes; existing app continues to work (new columns are nullable/defaulted).

### Database changes (`supabase/migrations/001_accountability_schema.sql`)

```sql
-- Widen accepted doc_type values
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check,
  ADD CONSTRAINT documents_doc_type_check
    CHECK (doc_type IN ('concall','annual_report','drhp','filing',
                        'quarterly_results','investor_presentation','rating_report'));

-- Guidance statements: normalization columns
ALTER TABLE guidance_statements
  ADD COLUMN metric_key       varchar(40),
  ADD COLUMN polarity         varchar(20),
  ADD COLUMN target_period    varchar(30),
  ADD COLUMN parsed_value     jsonb,
  ADD COLUMN is_active        boolean DEFAULT true,
  ADD COLUMN superseded_by    uuid REFERENCES guidance_statements(id);

-- Guidance outcomes: enrichment for resolution engine
ALTER TABLE guidance_outcomes
  ADD COLUMN method           varchar(30) DEFAULT 'manual',
  ADD COLUMN confidence       decimal(4,3),
  ADD COLUMN variance         text,
  ADD COLUMN evidence_excerpt text,
  ADD COLUMN resolved_at      timestamptz,
  ADD COLUMN updated_at       timestamptz DEFAULT now();

ALTER TABLE guidance_outcomes
  DROP CONSTRAINT IF EXISTS guidance_outcomes_outcome_check,
  ADD CONSTRAINT guidance_outcomes_outcome_check
    CHECK (outcome IN ('met','missed','exceeded','revised','pending',
                       'in_progress','unresolved_no_data'));

-- Extracted actuals (new table)
CREATE TABLE extracted_actuals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES companies(id) ON DELETE CASCADE,
  document_id   uuid REFERENCES documents(id) ON DELETE CASCADE,
  metric_key    varchar(40) NOT NULL,
  period        varchar(30) NOT NULL,
  value         jsonb NOT NULL,
  excerpt       text,
  confidence    decimal(4,3),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX ON extracted_actuals(company_id, metric_key, period);

-- Revision events (new table)
CREATE TABLE revision_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid REFERENCES guidance_statements(id) ON DELETE CASCADE,
  successor_id      uuid REFERENCES guidance_statements(id) ON DELETE CASCADE,
  direction         varchar(15) CHECK (direction IN ('UPGRADE','DOWNGRADE','REAFFIRMED')),
  delta_description text,
  created_at        timestamptz DEFAULT now()
);

-- Management scores: coverage fields
ALTER TABLE management_scores
  ADD COLUMN resolved_count int DEFAULT 0,
  ADD COLUMN total_count    int DEFAULT 0,
  ADD COLUMN status         varchar(15) DEFAULT 'provisional'
    CHECK (status IN ('provisional','rated'));
```

### Files to create

| File | Purpose |
|---|---|
| `lib/taxonomy.ts` | Metric taxonomy registry: array of `{ key, aliases, unit, polarity, resolution_method, sector?, confidence_notes }`. Frozen config exported as `METRIC_TAXONOMY`. Includes lookup helpers: `canonicalizeMetric(raw: string): { metric_key, polarity, confidence_m }`. |
| `lib/timeframe.ts` | Timeframe grammar: `parseTimeframe(raw: string, statementPeriod: string): { target_period, canonical, horizon_inferred, confidence_p }`. Handles FY/Q/H/multi-year/vague. Indian fiscal year logic. |
| `lib/value-parser.ts` | Value normalization: `parseValue(raw: string | null, metric_key: string): { low, high, unit, type: 'point'\|'range'\|'threshold'\|'directional'\|null, confidence_v }`. Handles "double-digit", "₹500 cr", "14–16%", "at least", "north of", etc. |
| `lib/resolution.ts` | Resolution method implementations: `compare(guidance: ParsedValue, actual: ParsedValue, polarity, tolerance): Outcome`. Implements RM-DELTA-YOY, RM-LEVEL, RM-ABS, RM-RATIO, RM-CAGR, RM-PLAN-ATTAIN, RM-DIRECTION, RM-THRESHOLD. Pure functions. |
| `lib/confidence.ts` | Confidence composite: `computeConfidence(m, p, v, t, a): number`. Tier assignment: `assignTier(C, guidanceType, hasConflict, sourceAuthority): 'T1'\|'T2'\|'T3'`. Constants for thresholds/weights. |
| `lib/scoring.ts` | Management score computation: `computeManagementScore(statements, outcomes): ScoreResult`. Replaces the inline `recomputeManagementScore`. Handles provisional/rated status. |
| `supabase/migrations/001_accountability_schema.sql` | The statements above as a runnable migration. |

### Files to modify

| File | Change |
|---|---|
| `types/index.ts` | Add: `MetricKey`, `Polarity`, `ParsedValue`, `ExtractedActual`, `RevisionEvent`, `OutcomeMethod`, `ScoreStatus`, `ScoreResult`, `ResolutionMethod`, `ConfidenceTier`, `OutcomeUpdatePayload`. Extend `GuidanceStatement` with new nullable fields. Extend `GuidanceOutcome` with new fields. Extend `ManagementScore` with `resolved_count`, `total_count`, `status`. Widen `DocType` and `Outcome` unions. |
| `supabase/schema.sql` | Incorporate all changes (for fresh installs). |

### Testing

- Unit tests for `canonicalizeMetric` (exact alias match, fuzzy, unclassified).
- Unit tests for `parseTimeframe` (FY, Q, H, multi-year, vague, calendar conversion).
- Unit tests for `parseValue` (point, range, threshold, directional, nulls, Indian conventions).
- Unit tests for `compare` (each RM, each polarity, at/beyond tolerance).
- Unit tests for `computeConfidence` + `assignTier` (boundary cases, conflict downgrade).
- Unit tests for `computeManagementScore` (provisional threshold, hit-rate calc, revision penalty).

### Acceptance criteria

1. Migration applies cleanly on existing DB without data loss.
2. Existing `process-document` flow continues to work (new columns nullable).
3. All pure library functions pass unit tests.
4. `npm run build && npm run typecheck` green.

---

## M1 — Normalization layer (guidance enrichment on ingest)

**Goal:** Every new guidance statement extracted by the LLM is immediately normalized (metric_key, polarity, target_period, parsed_value) before storage. The enrichment makes statements machine-comparable.

### Files to modify

| File | Change |
|---|---|
| `lib/prompts.ts` | Update `EXTRACTION_SYSTEM_PROMPT` to request `metric_key` (from a provided list) alongside free-text `metric`. Add field `value_type` to extraction schema. Prompt change only — output schema grows, remains backward-compatible (new fields nullable). |
| `lib/claude.ts` (or `lib/llm.ts`) | `extractGuidance` post-processes each statement: call `canonicalizeMetric`, `parseTimeframe`, `parseValue` to fill normalized columns. If the LLM itself emitted a valid `metric_key`, prefer it (confidence bonus); else fall back to alias lookup. Return enriched shape. |
| `app/api/process-document/route.ts` | Store the new normalized fields (`metric_key`, `polarity`, `target_period`, `parsed_value`, `is_active=true`). Before inserting, check for prior active statement on the same `(company, metric_key, target_period)` — if found, mark prior `is_active=false`, link `superseded_by`, and insert a `revision_events` row with direction inferred from delta between old and new `parsed_value`. |
| `types/index.ts` | `ExtractedGuidance` gains optional `metric_key`, `value_type`. |

### Files to create

| File | Purpose |
|---|---|
| `lib/revision.ts` | `detectRevision(prior: ParsedValue, current: ParsedValue, polarity): { direction, delta_description }` — pure comparison; used at ingest to emit revision events. |

### Testing

- Integration: ingest a concall containing two statements on the same metric → second supersedes first, revision event stored.
- Unit: `detectRevision` across upgrade/downgrade/reaffirm cases.
- Confirm enriched columns populated on new ingests; old rows remain (nullable columns = null).

### Acceptance criteria

1. A newly ingested transcript produces guidance rows with `metric_key`, `polarity`, `target_period`, `parsed_value` filled.
2. Revision detection fires when the same metric+period is re-guided.
3. Existing guidance data untouched.
4. Build green.

---

## M2 — Actuals extraction pass

**Goal:** When a quarterly result / annual report / investor presentation / rating report is uploaded, extract **actuals** (realized numbers) and persist them to `extracted_actuals`. This is the "denominator" side of the resolution equation.

### Files to create

| File | Purpose |
|---|---|
| `lib/prompts-actuals.ts` | `ACTUALS_EXTRACTION_PROMPT` — structured extraction of realized metrics: `{ metric_key, period, value: {amount, unit, type}, excerpt }[]`. Constrained to factual backward-looking numbers. Includes the metric-key list as a reference. |
| `lib/extract-actuals.ts` | `extractActuals(text, period, company, docType): ExtractedActual[]` — calls LLM with the actuals prompt, normalizes output via `parseValue`, assigns source authority `a` by doc type per §5.1 of spec. |

### Files to modify

| File | Change |
|---|---|
| `app/api/process-document/route.ts` | After guidance extraction (concalls) or in place of it (quarterly_results/annual_report/investor_presentation/rating_report): call `extractActuals`, persist to `extracted_actuals` table. Guidance extraction remains for guidance-bearing docs only (concall, investor_presentation, drhp). Actuals extraction runs on all non-concall types + concalls (management self-reported). |
| `types/index.ts` | `ExtractedActual` interface (already added in M0). |

### Testing

- Integration: upload a quarterly-results PDF → `extracted_actuals` rows created with correct metric_key + period.
- Unit: actuals prompt returns valid JSON; `extractActuals` normalizes correctly.
- Edge case: annual report that contains both outlook (guidance) and results (actuals) — both paths fire.

### Acceptance criteria

1. Uploading a quarterly-results doc produces `extracted_actuals` rows.
2. Each row has `metric_key`, canonical `period`, parsed `value`, `excerpt`, authority-derived `confidence`.
3. Existing concall upload still works and additionally stores self-reported actuals from the transcript.
4. Build green.

---

## M3 — Resolution engine

**Goal:** For every `PENDING` or `IN_PROGRESS` guidance statement whose target period is covered by an extracted actual, automatically compute an outcome with a confidence score, assign a tier (T1/T2/T3), and persist the result.

### Files to create

| File | Purpose |
|---|---|
| `lib/resolver.ts` | The core engine. `resolveOutcomes(companyId, supabase): ResolutionReport` — queries unresolved statements, matches against `extracted_actuals` by `(company_id, metric_key, period ⊇ target_period)`, calls `compare()` per resolution method, computes composite confidence via `computeConfidence()`, assigns tier via `assignTier()`, applies T1 auto-confirms, queues T2 suggestions, leaves T3 pending. Returns a report of actions taken. |
| `app/api/resolve/route.ts` | `POST /api/resolve` — accepts `{ company_id }` (or all), runs the resolver, returns the report. Triggered after actuals ingestion. |

### Files to modify

| File | Change |
|---|---|
| `app/api/process-document/route.ts` | After actuals extraction, call `resolveOutcomes(companyId, supabase)` to trigger immediate resolution for the company. |
| `lib/scoring.ts` | Already created in M0. Called by the resolver after outcomes are written to recompute management score. |
| `app/api/guidance/route.ts` | GET response now includes `method`, `confidence`, `variance`, `evidence_excerpt` from the enriched outcome row. |

### Resolution logic (pseudocode per spec §4)

```
for each unresolved statement S where target_period is elapsed:
  candidates = extracted_actuals WHERE metric_key=S.metric_key
               AND period covers S.target_period
  if candidates.empty:
    if lookahead_window_expired(S.target_period):  // 4 quarters
      S.outcome = UNRESOLVED_NO_DATA
    continue

  best = select by source_authority (highest a), then most recent
  others = remaining candidates

  outcome = compare(S.parsed_value, best.value, S.polarity, tolerance(S.metric_key))
  C = computeConfidence(m, p, v, t, a)

  if others agree with outcome: C += 0.10 (cap 1.0)
  if others disagree: C -= 0.25; force T2

  tier = assignTier(C, S.guidance_type, has_conflict, best.authority)

  if tier == T1:
    persist outcome(method=AI_AUTO, confidence=C, ...)
  elif tier == T2:
    persist outcome(method=AI_SUGGESTED, confidence=C, outcome=..., ...)
  else:
    leave PENDING
```

### Testing

- Unit: resolver with mock data (known statement, known actual) → correct outcome + tier.
- Boundary: confidence exactly at 0.85 → T1; at 0.84 → T2; conflict → forced T2.
- Multi-year: `IN_PROGRESS` → not resolved until terminal; interim progress tracked.
- Revision: superseded statement skipped (only active resolved).
- Scoring: after resolution, `computeManagementScore` reflects new hit-rate; `provisional` until ≥5.

### Acceptance criteria

1. After uploading a quarterly-results doc for a company that has existing guidance, unresolved statements with matching metric+period auto-resolve (T1) or get suggestions (T2).
2. T1 outcomes immediately reflect in the credibility score.
3. T2 outcomes marked `ai_suggested`, excluded from score.
4. `POST /api/resolve` returns a structured report: `{ resolved: [...], suggested: [...], unchanged: [...] }`.
5. Build green.

---

## M4 — Review queue + analyst override + score UI

**Goal:** Surface T2 suggestions for one-click accept/edit; allow manual outcome entry (T3/any); wire overrides to lock outcomes and recompute scores; show trustworthy score state.

### Files to create

| File | Purpose |
|---|---|
| `components/OutcomeEditor.tsx` | Per-statement inline control: outcome select + actual-value input + notes + evidence-period reference. For T2 items, pre-fills with AI suggestion + confidence indicator. Save calls `PATCH /api/guidance`. |
| `components/ReviewQueue.tsx` | Filtered list of T2 (ai_suggested) outcomes across all companies or per-company. Sortable by confidence, metric, period. Bulk-accept option for high-confidence items. |
| `app/review/page.tsx` | Page rendering `ReviewQueue`. Linked from dashboard. |

### Files to modify

| File | Change |
|---|---|
| `app/api/guidance/route.ts` | PATCH: accept `method` override; if analyst sets outcome → `method=analyst_confirmed`, set `resolved_at=now()`, lock from future auto-overwrite. After persist → call `scoring.recompute`. Return updated score. GET: support `?status=suggested` filter for review queue. |
| `components/GuidanceTimeline.tsx` | Add `editable` prop. Render `OutcomeEditor` per item. Show promised vs actual + variance + method badge (auto/suggested/confirmed/manual). Color: met=green, exceeded=indigo, missed=red, revised=amber, pending=gray, in_progress=blue. |
| `components/CredibilityScore.tsx` | Show `resolved_count / total_count` coverage. Badge: "Provisional" (< 5 resolved) or "Rated". Method-mix indicator (% auto vs analyst-confirmed). |
| `app/company/[ticker]/page.tsx` | Pass `editable={true}` to timeline. Add link to `/review?ticker=X`. |
| `app/dashboard/page.tsx` | Show review-queue count badge in nav if T2 items pending. |
| `lib/scoring.ts` | Ensure only `method ∈ {ai_auto, analyst_confirmed}` count toward score. T2 (`ai_suggested`) excluded until confirmed. Provisional threshold = `resolved_count < 5`. |
| `app/layout.tsx` | Add "Review" nav link with pending-count badge. |

### Testing

- Integration: analyst confirms a T2 suggestion → method flips to `analyst_confirmed`, outcome counts in score, score recomputes.
- Integration: analyst overrides a T1 auto-confirm → row locks, labeled pair stored (features + AI_outcome + human_outcome for future calibration).
- UI: pending item shows empty editor; suggested item shows pre-filled editor with confidence badge.
- Score: < 5 confirmed = "Provisional"; ≥ 5 = "Rated"; coverage fraction correct.

### Acceptance criteria

1. From the company page, an analyst can set an outcome (met/missed/exceeded/revised) + actual value + notes on any statement.
2. T2 suggestions appear pre-filled with a confidence indicator; one click to accept or edit.
3. `/review` page lists all pending T2 items globally.
4. Override locks the row; subsequent resolver runs skip it.
5. Credibility score shows correct coverage, status, and responds to outcome changes.
6. Build green.

---

## Recommended build sequence for fastest working product

**Phase A (5 days): M0 → M1 → M4 (manual + enriched)**

Delivers:
- Normalized guidance on ingest (metric_key, target_period, parsed_value, polarity).
- Revision detection.
- Manual outcome entry with enriched UI (inline editor + review page).
- Trustworthy scoring (provisional/rated, coverage, formula from spec).
- **A working Guidance Accountability product.** Analyst uploads transcripts over successive quarters, records outcomes, watches credibility scores diverge.

**Phase B (5 days): M2 → M3 (auto-resolution)**

Upgrades:
- Actuals auto-extracted from results/reports.
- Resolution engine matches and auto-confirms (T1) or suggests (T2).
- Analyst effort drops from "enter every outcome" to "review flagged suggestions."
- The compounding flywheel begins (auto-resolution + override-as-label).

Phase A is independently deployable and valuable. Phase B is a pure upgrade with zero rework.

---

## Dependency & risk summary

| Risk | Mitigation |
|---|---|
| LLM extraction quality (metric_key, actuals) | Taxonomy provided in-prompt constrains output; fuzzy fallback + UNCLASSIFIED flag; analyst override corrects |
| Tolerance miscalibration | Defaults are conservative (wide); analyst overrides + labeled pairs enable future tightening |
| Schema migration on production DB | Migration is additive (ALTERs + new tables); no drops; backward-compatible |
| M0–M1 delivers value without M2–M3? | Yes: with M4 (manual editor), analysts can record outcomes immediately using enriched data; auto-resolution upgrades it later |

---

## File inventory (complete)

### New files (ordered by creation)

1. `supabase/migrations/001_accountability_schema.sql`
2. `lib/taxonomy.ts`
3. `lib/timeframe.ts`
4. `lib/value-parser.ts`
5. `lib/confidence.ts`
6. `lib/resolution.ts`
7. `lib/scoring.ts`
8. `lib/revision.ts`
9. `lib/prompts-actuals.ts`
10. `lib/extract-actuals.ts`
11. `lib/resolver.ts`
12. `app/api/resolve/route.ts`
13. `components/OutcomeEditor.tsx`
14. `components/ReviewQueue.tsx`
15. `app/review/page.tsx`
16. `tests/scoring.test.ts`
17. `tests/taxonomy.test.ts`
18. `tests/timeframe.test.ts`
19. `tests/value-parser.test.ts`
20. `tests/resolution.test.ts`
21. `tests/confidence.test.ts`
22. `tests/resolver.test.ts`

### Modified files

1. `types/index.ts`
2. `supabase/schema.sql`
3. `lib/prompts.ts`
4. `lib/claude.ts` (→ `lib/llm.ts` optional rename)
5. `app/api/process-document/route.ts`
6. `app/api/guidance/route.ts`
7. `components/GuidanceTimeline.tsx`
8. `components/CredibilityScore.tsx`
9. `app/company/[ticker]/page.tsx`
10. `app/dashboard/page.tsx`
11. `app/layout.tsx`

---

## Final note on LLM provider

This plan is **provider-agnostic**. Every LLM call goes through `lib/llm.ts` (the renamed `claude.ts`). The Ollama migration (a separate ranked item) swaps the provider behind the same interface. Spec v1.0's intelligence layer works identically on Claude, Ollama, or any JSON-capable model — the confidence framework already accounts for extraction-quality variance through the `v` (value-parse certainty) and `m` (metric-match) components.

**Ready to begin Phase A (M0 → M1 → M4) on your command.**
