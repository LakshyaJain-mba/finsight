# Implementation Report — Phase A (M0 + M1 + M4)

**Spec:** v1.0 (frozen) · **Scope:** M0 foundation, M1 ingest normalization, M4
review/override/score UI · **Excluded:** M2, M3 (not started, by instruction).

## Validation results

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ exit 0 |
| Production build | `npm run build` | ✅ exit 0 — 12 routes compiled |
| Lint | `npx next lint` | ✅ no warnings or errors |

## Files created (12)

| File | Milestone | Purpose |
|---|---|---|
| `lib/taxonomy.ts` | M0 | Frozen metric taxonomy + canonicalization + tolerances (Spec §1/§2) |
| `lib/timeframe.ts` | M0 | Timeframe grammar parser (Spec §3) |
| `lib/value-parser.ts` | M0 | Value normalization (Spec §4.4) |
| `lib/confidence.ts` | M0 | Confidence framework + tier gating (Spec §5) |
| `lib/resolution.ts` | M0 | Pure outcome comparison (Spec §2/§4.4) |
| `lib/scoring.ts` | M0 | Pure credibility score + DB recompute helper |
| `lib/revision.ts` | M0 | Revision direction detection |
| `lib/normalize.ts` | M1 | Deterministic guidance enrichment |
| `supabase/migrations/001_accountability_schema.sql` | M0 | Additive DB migration |
| `components/OutcomeEditor.tsx` | M4 | Inline outcome capture control |
| `components/ReviewQueue.tsx` | M4 | Pending-statement review list |
| `app/review/page.tsx` | M4 | Review queue page |

## Files modified (8)

| File | Milestone | Change |
|---|---|---|
| `types/index.ts` | M0 | New types; extended `GuidanceStatement`/`GuidanceOutcome`/`ManagementScore`; widened `DocType`/`Outcome` |
| `supabase/schema.sql` | M0 | Fresh-install schema updated to match migration |
| `app/api/process-document/route.ts` | M1 | Normalization + revision detection on ingest; shared scoring; 7 doc types |
| `app/api/guidance/route.ts` | M4 | `status=pending` GET; PATCH override → `analyst_confirmed` + score recompute |
| `components/GuidanceTimeline.tsx` | M4 | `editable` mode, variance/method badges, group by `target_period` |
| `components/CredibilityScore.tsx` | M4 | Coverage + Provisional/Rated status |
| `app/company/[ticker]/page.tsx` | M4 | Editable timeline + review link |
| `app/dashboard/page.tsx` | M4 | Pending-outcome count indicator |
| `app/layout.tsx` | M4 | Review nav link |

## Database changes

All additive and backward-compatible (apply `supabase/migrations/001_accountability_schema.sql`):

- **documents** — `doc_type` enum widened to include `quarterly_results`,
  `investor_presentation`, `rating_report`.
- **guidance_statements** — added `metric_key`, `polarity`, `target_period`,
  `parsed_value (jsonb)`, `is_active (default true)`, `superseded_by`; new index
  `(company_id, metric_key, target_period)`.
- **guidance_outcomes** — added `method (default manual)`, `confidence`, `variance`,
  `evidence_excerpt`, `resolved_at`, `updated_at`; outcome enum widened
  (`in_progress`, `unresolved_no_data`); method check constraint.
- **management_scores** — added `resolved_count`, `total_count`, `status`.
- **extracted_actuals** — new table (populated by M2/M3).
- **revision_events** — new table (populated at ingest from M1).

## What works now (Phase A user journey)

1. Upload a transcript → guidance is extracted **and normalized** (metric_key,
   polarity, target_period, parsed_value) and stored.
2. Re-guiding the same metric+period in a later document **supersedes** the prior
   statement and logs a revision event.
3. Company page shows an **editable timeline**; analyst records outcomes
   (met/missed/exceeded/revised/in_progress) with actual value + notes.
4. Saving an outcome marks it **analyst-confirmed**, recomputes the credibility
   score, and the widget reflects **coverage** + **Provisional/Rated** status.
5. **Review queue** (`/review`, with dashboard counter) lists all pending
   statements for fast manual resolution.

## Known limitations

1. **No automated outcome detection yet** (M2/M3 deferred). The resolution engine
   (`resolution.ts`) and confidence gating (`confidence.ts`) are implemented and
   unit-ready but **not wired into ingest**; the review queue surfaces PENDING
   statements for **manual** entry, not AI suggestions.
2. **`extracted_actuals` is unpopulated** until M2 (actuals extraction) lands.
3. **No automated tests added.** Per project policy (no tests unless requested) and
   the Phase A validation scope (build/lint/typecheck), the pure modules are written
   to be unit-testable but tests are deferred. Recommend a future `vitest` suite for
   `taxonomy`, `timeframe`, `value-parser`, `confidence`, `resolution`, `scoring`,
   `revision`.
4. **Migration must be applied** before new ingests run — new writes use the added
   columns. Reads of legacy rows are safe (new columns are nullable/defaulted).
   Could not be executed here (no live DB in this environment).
5. **Legacy rows are not backfilled** — guidance ingested before this change has
   NULL `metric_key`/`target_period`/`parsed_value`. A one-off backfill script is
   recommended (reuse `normalizeGuidance`).
6. **Provider/embeddings unchanged.** Still on the paid stack (Claude + OpenAI/Voyage);
   the Ollama/local-embeddings migration remains a separate, ranked workstream.
7. **Score weighting unchanged** from the prior composite (intentional — Spec v1.0
   governs the resolution/confidence intelligence, not the management-score weights).

## Next recommended milestone

**M2 — Actuals Extraction Pass.** It is the smallest next step that unlocks the
hybrid value loop:

- Add `lib/prompts-actuals.ts` + `lib/extract-actuals.ts`; populate
  `extracted_actuals` on ingest of quarterly results / annual reports / investor
  presentations / rating reports (source authority per Spec §5.1).
- This is the prerequisite for **M3** (resolution engine), which then auto-confirms
  T1 outcomes and converts the review queue from manual entry into one-click
  confirmation of AI suggestions — beginning the compounding, low-effort dataset.

Recommended sequence: **M2 → M3**, then revisit the Ollama/local-embeddings migration
for the zero-cost goal.
