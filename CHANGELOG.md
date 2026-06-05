# Changelog

## [Phase A] — Guidance Accountability Engine (M0 + M1 + M4)

Implements the intelligence-layer foundation, ingest-time normalization, and the
analyst review/override loop per **Specification v1.0 (frozen)**. All changes are
additive and backward-compatible. Provider-agnostic (no LLM provider change).

### Added — M0 (foundation, pure + schema)

- `lib/taxonomy.ts` — frozen metric taxonomy (Spec §1): 35 canonical metrics with
  aliases, units, polarity, resolution method; `canonicalizeMetric()`,
  `getMetricConfig()`, `toleranceFor()` (Spec §2 tolerance bands).
- `lib/timeframe.ts` — timeframe grammar (Spec §3): `parseTimeframe()` for
  FY/H1/H2/Q1–Q4/multi-year/CAGR/rolling/vague horizons; Indian fiscal-year and
  fiscal-quarter logic; confidence per construct.
- `lib/value-parser.ts` — value normalization (Spec §4.4): `parseValue()` for
  point/range/threshold/directional, Indian conventions (₹ cr/lakh, bps),
  phrase lexicon ("double-digit", "high-teens", etc.).
- `lib/confidence.ts` — confidence framework (Spec §5): frozen weights
  `{m:.25,p:.20,v:.20,t:.15,a:.20}`, source-authority tables (actuals + guidance),
  `computeConfidence()`, `applyCorroboration()`, `assignTier()` (T1/T2/T3),
  thresholds (0.85 / 0.55), provisional cutoff (5).
- `lib/resolution.ts` — resolution rules (Spec §2/§4.4): pure `compare()` honoring
  polarity + tolerance for all guidance types; `describeVariance()`.
- `lib/scoring.ts` — `computeManagementScore()` (pure; only `ai_auto` +
  `analyst_confirmed` outcomes count; provisional until ≥5 resolved) and
  `recomputeAndPersistScore()` (DB helper).
- `lib/revision.ts` — `detectRevision()` (UPGRADE/DOWNGRADE/REAFFIRMED) honoring polarity.
- `lib/normalize.ts` — `normalizeGuidance()` deterministic enrichment composing the
  modules above.
- `supabase/migrations/001_accountability_schema.sql` — additive migration:
  widened `documents.doc_type`; added `guidance_statements` normalization columns
  (`metric_key`, `polarity`, `target_period`, `parsed_value`, `is_active`,
  `superseded_by`); added `guidance_outcomes` enrichment (`method`, `confidence`,
  `variance`, `evidence_excerpt`, `resolved_at`, `updated_at`); widened outcome
  enum (`in_progress`, `unresolved_no_data`); new tables `extracted_actuals`,
  `revision_events`; `management_scores` gained `resolved_count`, `total_count`,
  `status`; new indexes.

### Added — M4 (review / override / score UI)

- `components/OutcomeEditor.tsx` — inline outcome control (outcome + actual value +
  notes); PATCHes `/api/guidance`; refreshes on save.
- `components/ReviewQueue.tsx` — client list of pending statements with per-item editors.
- `app/review/page.tsx` — review-queue page (global or `?ticker=`-scoped).

### Changed — M1 (normalization on ingest)

- `app/api/process-document/route.ts`
  - Widened accepted `doc_type` values (7 types).
  - Each extracted statement enriched via `normalizeGuidance()` and stored with
    normalized columns + `is_active=true`.
  - New `applyRevisionDetection()` supersedes prior active statements on the same
    `(metric_key, target_period)` and logs `revision_events` (best-effort).
  - Removed the inline `recomputeManagementScore()`; now uses
    `recomputeAndPersistScore()` from `lib/scoring.ts`.
  - Pending outcomes now stamped `method='manual'`.

### Changed — M4 (API + UI)

- `app/api/guidance/route.ts`
  - `GET ?status=pending[&company_id]` → review-queue items.
  - `PATCH` → analyst override sets `method='analyst_confirmed'`, stamps
    `resolved_at`/`updated_at`, recomputes + persists the credibility score, and
    returns the updated `score`.
- `components/GuidanceTimeline.tsx` — `editable` prop renders `OutcomeEditor`;
  groups by `target_period`; shows promised/actual/variance + method badge; new
  outcome-state colors.
- `components/CredibilityScore.tsx` — coverage ("X of Y resolved") + Provisional/Rated badge.
- `app/company/[ticker]/page.tsx` — editable timeline + "Review outcomes" link.
- `app/dashboard/page.tsx` — "N awaiting outcome" review-queue indicator.
- `app/layout.tsx` — "Review" nav link.
- `types/index.ts` — new types (`Polarity`, `ValueType`, `ParsedValue`,
  `ResolutionMethod`, `OutcomeMethod`, `ScoreStatus`, `ConfidenceTier`,
  `RevisionDirection`, `MetricConfig`, `ConfidenceComponents`, `ExtractedActual`,
  `RevisionEvent`, `ScoreResult`, `ReviewQueueItem`, `OutcomeUpdatePayload`);
  extended `GuidanceStatement`, `GuidanceOutcome`, `ManagementScore`; widened
  `DocType` and `Outcome` unions.

### Not included (deferred)

- **M2** (actuals extraction) and **M3** (resolution engine / auto-confirmation):
  `extracted_actuals`, `revision_events`, `resolution.ts`, and `confidence.ts` are
  in place but not yet wired into ingest. Review queue currently surfaces PENDING
  statements for manual entry (no AI suggestions yet).

### Validation

- `tsc --noEmit` ✓ · `next build` ✓ (12 routes) · `next lint` ✓ (no warnings/errors)
