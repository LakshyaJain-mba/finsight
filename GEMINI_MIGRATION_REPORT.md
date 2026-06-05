# Gemini Migration Report

**Migration:** Anthropic Claude API → **Google Gemini 2.5 Flash**
**Branch:** `gemini-migration` (backup: `phase-a-guidance-accountability`)
**Scope:** provider swap only — no business logic, normalization, scoring, review
queue, Supabase schema, prompts, JSON schemas, or UI changed.

## Exact model used

| Role | Model ID |
|---|---|
| `extractGuidance` | `gemini-2.5-flash` |
| `classifyIntent` | `gemini-2.5-flash` |
| `synthesizeAnswer` | `gemini-2.5-flash` |
| (`MODELS.powerful`, unused) | `gemini-2.5-pro` |

Transport: **Generative Language REST API** —
`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.

## Files changed (5)

| File | Change |
|---|---|
| `lib/claude.ts` | Rewritten internals to call Gemini via `fetch`. **Filename kept** so importers (`lib/agent.ts`, `app/api/process-document/route.ts`) need no edits. Exported signatures preserved: `extractGuidance(text, period, company)`, `classifyIntent(query)`, `synthesizeAnswer(query, context, history)`. `parseJson` fallback retained. `MODELS` map repointed to Gemini IDs. |
| `package.json` | Removed `@anthropic-ai/sdk`. No new dependency added (REST). |
| `.env.local.example` | `ANTHROPIC_API_KEY` → `GEMINI_API_KEY` (+ AI Studio link). |
| `README.md` | LLM references (overview, "how it works", env table) updated to Gemini. |
| `RUN_LOCAL.md` | Prerequisite, `.env` block, and troubleshooting rows updated to Gemini key/errors. |

Not modified (per constraints): `lib/prompts.ts`, `lib/agent.ts`, API routes, `types/`,
`lib/normalize|scoring|resolution|confidence|taxonomy|timeframe|value-parser`, all UI,
and `supabase/`. Historical docs (`PROJECT_AUDIT`, `FEATURE_MATRIX`,
`IMPLEMENTATION_*`) intentionally left as-is (out of allowed scope; they describe past state).

## Dependency changes

- **Removed:** `@anthropic-ai/sdk@^0.100.1` (and its tree pruned from `node_modules`).
- **Added:** none. Gemini is called over REST `fetch`, keeping dependencies minimal and
  the provider boundary inside a single file.

## Environment changes

| Before | After |
|---|---|
| `ANTHROPIC_API_KEY` | `GEMINI_API_KEY` |

All other env vars unchanged (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, optional `OPENAI_API_KEY`/`VOYAGE_API_KEY`).

## Structured JSON mode

- `extractGuidance` and `classifyIntent` request `generationConfig.responseMimeType =
  "application/json"` (Gemini structured JSON mode). `synthesizeAnswer` returns free text.
- `parseJson` (markdown-fence stripping + outermost-object isolation) is **retained** as a
  defensive fallback for all JSON paths.
- `generationConfig.thinkingConfig.thinkingBudget = 0` is set so reasoning tokens cannot
  consume the output budget and truncate JSON (mirrors Claude's direct-output behavior).
- `temperature = 0` for determinism (matches the prior extraction intent).

## Transport mapping (Claude → Gemini)

| Concept | Claude (before) | Gemini (after) |
|---|---|---|
| System prompt | `system` param | `systemInstruction.parts[].text` |
| Messages | `messages[{role,content}]` | `contents[{role,parts[].text}]` |
| Assistant role (history) | `assistant` | `model` |
| Token cap | `max_tokens` | `generationConfig.maxOutputTokens` |
| Response text | `content[0].text` | `candidates[0].content.parts[].text` (joined) |
| JSON mode | prompt-only | `responseMimeType: application/json` |

Token caps preserved: extraction 2000, intent 150, synthesis 600.

## Extraction behavior differences (to watch)

1. **Field-level interpretation drift** — Gemini may classify `guidance_type`,
   `confidence_signal`, `qualifier`, or the free-text `metric` differently from Claude.
   Because M1 normalization derives `metric_key`/`polarity`/`target_period`/`parsed_value`
   from these fields, distributions (and therefore credibility scores) can shift.
   **Action:** re-baseline via `TEST_PLAN.md` before trusting comparative scores.
2. **JSON reliability** — now enforced by `responseMimeType: application/json` (stronger
   than prompt-only), so raw-parse failures should *decrease*; `parseJson` remains as backup.
3. **Truncation risk** — mitigated by disabling thinking (`thinkingBudget: 0`); without
   this, 2.5 Flash could spend the 2000-token budget on reasoning and cut off the JSON.
4. **Safety filtering** — Gemini may set `promptFeedback.blockReason` or return no
   candidate; the wrapper throws a clear error (route handlers already catch and return 5xx).
5. **`metric: "margin"` vs specific** — unchanged prompt, but model phrasing differences
   may route more items to `OTHER`; monitor the unclassified rate.
6. **No semantic change to prompts/schemas** — `lib/prompts.ts` and all return types are
   byte-for-byte unchanged, so downstream code is unaffected by shape.

## Validation results

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ exit 0 |
| Production build | `npm run build` | ✅ exit 0 — 12 routes |
| Lint | `npx next lint` | ✅ no warnings or errors |

> Note: validations are static (compile/build/lint). Live request behavior requires a
> `GEMINI_API_KEY` and a runtime smoke test (upload a transcript) — recommended before
> merge, and a `TEST_PLAN.md` re-baseline before relying on cross-provider score parity.

## Rollback

`git checkout phase-a-guidance-accountability` restores the Anthropic implementation
unchanged (that branch was not modified).
