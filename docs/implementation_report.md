# Implementation Report

Date: 2026-06-06

Task: Review the evaluation pipeline — audit evaluate-extraction.mjs and
evaluate-rag.mjs, identify scoring weaknesses, recommend improvements.
(Analysis only; no evaluator code changed in this task.)

## Files audited
* scripts/evaluate-extraction.mjs
* scripts/evaluate-rag.mjs
* scripts/eval-common.mjs (shared thresholds/classify/verdict)

## 1. evaluate-extraction.mjs — findings

W1. **Precision denominator is mis-scoped (inflates or deflates precision).**
`precision = truePos / extractedTotal`, where `extractedTotal` = ALL active
statements for that company+period. Golden labels are usually a curated subset,
so legitimate extractions not present in the golden set count as false positives.
This penalizes precision unfairly and conflates "not labeled" with "wrong."
Effect: extraction_f1 is biased low whenever labels are partial (the normal case).

W2. **No false-positive taxonomy.** There is no notion of a hallucinated/
past-performance statement vs a merely-unlabeled one. The framework lists
hallucination as a CRITICAL failure, but the evaluator cannot detect it — it
only does set overlap. Critical-failure gate is therefore unenforced.

W3. **Matching is order-dependent and greedy.** First-fit assignment with a
single target_period tie-break is not a global optimal matching. With multiple
same-metric candidates, an early golden item can consume the row a later one
needed, understating recall. (Improved by the tie-break, not solved.)

W4. **Revision precision over-counts.** `revPredTotal` counts ALL revision_events
whose successor is in this period; `revHit` only counts golden-matched ones.
Any revision the labeler didn't enumerate is treated as a false positive →
revPrecision (and dupScore) biased low. Same partial-label problem as W1.

W5. **`revGoldenTotal === 0` yields revRecall = revPrecision = 1.0 → PASS.**
Single-period transcripts (no revisions) score a perfect duplicate_detection by
default. This is a vacuous PASS that can mask real revision bugs and inflate the
overall verdict.

W6. **Timeframe accuracy only scored on matched items.** Statements missed by
extraction are excluded from the timeframe denominator, so timeframe_accuracy is
measured on the easy subset (those already correctly extracted) — optimistic bias.

W7. **No value/unit correctness metric.** Despite recent P2/Option-B work on
value_given/parsed_value, the evaluator never checks numeric value or unit. The
"EBITDA margin = 20 crore" class would not be caught by any score here.

W8. **No polarity / metric_key correctness metric.** metric_key is used only as
a match key, never scored; a wrong-but-consistent classification is invisible.

W9. **Substring matching is brittle.** `statement_contains` + DB `statement` is
truncated to 200 chars at ingest; a labeled substring beyond 200 chars can never
match, causing false recall misses unrelated to model quality.

## 2. evaluate-rag.mjs — findings

W10. **hit@5 does not actually measure top-5 retrieval.** The match_chunks RPC is
called with a ZERO vector (ranking meaningless) and its result is ignored; the
"hit" is computed from the chat answer + citation excerpts via substring match.
So the metric is "did the final answer mention the expected words," not retrieval
recall@5. Mislabeled and conflates retrieval with generation.

W11. **hit@5 is gameable by generation.** Because the haystack includes the LLM
answer text, the model can satisfy relevant_contains from parametric knowledge
without any correct retrieval → false PASS on retrieval quality.

W12. **Citation accuracy uses a 60-char ILIKE substring.** Excerpts are matched
with `ilike %excerpt%` after stripping % and _. Short/þgeneric excerpts can match
the wrong chunk (false correct), and excerpts spanning chunk boundaries or with
normalized whitespace can fail to match a real source (false incorrect).

W13. **Citation accuracy has no relevance check.** A citation that traces to a
real chunk counts as correct even if that chunk is irrelevant to the answer —
measures "exists in DB," not "supports the claim." Answer grounding (a framework
metric) is not implemented at all.

W14. **citationTotal === 0 ⇒ FAIL is correct, but per-query retrieval with zero
citations still counts as a hit if the answer text contains the words** (W11),
so a query can be a retrieval "hit" with zero citations — internally inconsistent.

W15. **Non-determinism not controlled.** Chat goes through the live LLM; runs are
not seeded/cached, so scores vary run-to-run with no variance reporting or
multi-run averaging.

## 3. Shared / framework-level findings

W16. **Verdict gate ignores critical failures.** overallVerdict only inspects
PASS/CONDITIONAL/FAIL bands. The framework's CRITICAL failures (polarity
inversion, false supersede, fabricated citation) cannot drive NO-GO because they
are never computed (W2, W13).

W17. **No per-transcript breakdown.** Everything is pooled across transcripts, so
one bad transcript is averaged away; the matrix in EVALUATION_FRAMEWORK.md
(metric × transcript) is not actually produced.

W18. **No inter-annotator / label-quality guard.** Single-label golden sets are
taken as absolute truth; framework calls for kappa on ≥2 transcripts.

W19. **Small-N instability.** With ~5–10 golden items, one miss swings F1 by
10–20 points; no confidence interval or min-N warning is emitted.

## 4. Recommendations (ranked; not yet implemented)

R1 (high). Fix precision scoping: score precision against a labeled-as-complete
set, or label each transcript's guidance exhaustively and add an explicit
`is_complete` flag per transcript; only then count unmatched extractions as FP.
Otherwise report recall + "extra extractions" separately instead of a biased F1.

R2 (high). Make retrieval real: embed the query via the app's own embedding path
(or expose a tiny eval endpoint) and pass that vector to match_chunks; compute
hit@5 from the RPC rows ONLY (exclude the LLM answer text). Fixes W10/W11/W14.

R3 (high). Add the missing CRITICAL-failure detectors and wire them into the
verdict: polarity inversion (compare outcome vs polarity), false supersede
(superseded a distinct active promise), fabricated citation (no source chunk).
Make any critical failure force NO-GO. Fixes W2/W16.

R4 (med). Add value/unit + metric_key + polarity correctness metrics on matched
items (W7/W8) so P2/Option-B regressions are measurable.

R5 (med). Score timeframe over ALL golden items (missed = timeframe miss), not
just matched ones (W6). Treat `revGoldenTotal===0` as "n/a" excluded from the
verdict rather than a 1.0 PASS (W5).

R6 (med). Replace substring citation match with chunk_id-based tracing: have the
chat citation carry the chunk id, compare against retrieved ids; add an answer-
grounding metric (claims supported by retrieved chunks). Fixes W12/W13.

R7 (low). Emit per-transcript matrix rows + min-N warnings + multi-run averaging
for the LLM path (W15/W17/W19). Raise statement truncation or match on a stored
full-text field (W9).

## Priority
R1, R2, R3 are the high-signal fixes: they correct the two headline metrics
(extraction F1, retrieval hit@5) that are currently biased/mislabeled, and they
make the CRITICAL-failure gate real. R4–R7 improve coverage and stability.

## Validation
* Typecheck/lint/build: not run (audit only; no code changed this task).

## Constraints honored
No new tasks created; project direction unchanged; deliverable limited to this
report. benchmark_results.md left as-is (no benchmark was run in this task).


---

# Implementation Report — Evaluation Pipeline Fixes (R2, R3, R1)

Date: 2026-06-06

Task: Implement audit recommendations R2 → R3 → R1 from the evaluation review.
All changes are confined to the evaluation scripts (no app/lib/schema changes).

## Files changed
* scripts/eval-common.mjs
  - R2: added `embedQuery()` — embeds eval queries via the app's real provider
    (gemini-embedding-001, RETRIEVAL_QUERY, 1536-dim, L2-normalised).
  - R3: `overallVerdict()` now forces NO-GO when `critical_failures[]` is non-empty;
    `printScorecard()` prints the critical-failure list.
  - R1: added `extraction_recall` threshold band (0.85 / 0.80).
* scripts/evaluate-rag.mjs
  - R2: hit@5 now computed ONLY from actual `match_chunks` rows for a real query
    embedding. The LLM answer text is no longer part of the hit decision (fixes
    W10/W11/W14).
  - R3: fabricated-citation detector — any chat citation whose excerpt traces to
    no stored chunk is recorded as a CRITICAL failure (forces NO-GO).
  - Citation accuracy now also penalises period mismatch and uses whitespace-
    normalised tracing.
* scripts/evaluate-extraction.mjs
  - R1: precision is scored ONLY over transcripts explicitly marked
    `"is_complete": true`. Without exhaustive labels, the evaluator reports
    `extraction_recall` (not a biased F1) and counts unmatched extractions as
    `extraUnlabeled` (reported, not penalised). Fixes W1.
  - R3: two CRITICAL detectors → NO-GO:
      * polarity_inversion — matched statement's extracted polarity contradicts
        the golden polarity (would flip met/missed).
      * false_supersede — a revision_event whose original and successor describe
        different metric_key/target_period (a distinct active promise hidden).
  - R5-lite: `duplicate_detection` is N/A (excluded from verdict) when no golden
    revisions are labeled, instead of a vacuous 1.0 PASS (fixes W5).

## Validation results
* node --check (all 3 scripts): OK
* example-template guard: still refuses EXAMPLE-DO-NOT-USE (exit 2)
* npm run typecheck: PASS (exit 0)
* npx next lint: PASS (no warnings/errors)
* npm run build: PASS (12 routes compiled)
Note: app build/lint/typecheck are unaffected because changes are JS eval scripts.
Live evaluator execution was NOT run here (no .env.local / GEMINI_API_KEY / DB in
this environment); functional verification of the new metrics requires a live run.

## Benchmark impact (expected)
* retrieval_hit_at_5 becomes a TRUE retrieval metric (top-5 chunks for a real
  query vector). Previously it could PASS from the LLM's parametric answer with
  zero correct retrieval; that false-PASS path is removed. Scores may move down
  to reflect actual retrieval quality.
* CRITICAL gate is now enforceable: polarity inversion, false supersede, and
  fabricated citation each force NO-GO regardless of band scores — closing the
  gap where the framework's critical failures were undetectable (W2/W13/W16).
* extraction precision/F1 is no longer biased low by partial labeling; F1 is
  reported only when a transcript is exhaustively labeled, otherwise recall is
  the headline number. Expect higher, fairer extraction scores on partial sets.

## Not addressed (deferred, per scope)
R4 (value/unit/metric_key correctness), R6 (chunk-id citation tracing + answer
grounding), R7 (per-transcript matrix, multi-run averaging, min-N warnings).
These remain open from the audit and were intentionally out of this task's scope.
