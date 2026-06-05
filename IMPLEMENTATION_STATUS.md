# IMPLEMENTATION_STATUS.md

Honest status report. Companion to `PROJECT_AUDIT.md` and `FEATURE_MATRIX.md`.

## A. Current user journey

What actually works today (single user, paid keys + schema deployed):

1. Land on `/` → redirect to `/dashboard`.
2. Dashboard loads companies + credibility widgets + "recently processed".
   (Empty on first run.)
3. Go to `/upload`. Create a company inline (ticker + name), or pick one.
4. Upload a PDF **or** paste transcript text; set period + doc type.
5. Submit → `/api/process-document`:
   - extract text → extract guidance (Claude) → store statements (+ pending
     outcomes) → chunk → embed (OpenAI/Voyage) → store chunks → recompute score.
6. See a `ConcallCard` with tone, guidance table, summary, themes.
7. Open `/company/[ticker]` → guidance timeline (all outcomes show "pending")
   + credibility gauge.
8. Open `/chat` (optionally scoped to a ticker) → ask a question → answer streams
   in (simulated) with a collapsible citations block.

**Where the journey breaks down**
- The credibility score never improves/declines meaningfully because **no step
  lets the user record an actual outcome** (PATCH exists but is unreachable from
  the UI).
- Chat quality/cost depends entirely on paid APIs; with no embedding key, RAG
  silently returns nothing for "what did management say about X".
- Anyone with the URL has full read/write (no login).

## B. Missing functionality

- **Cost goal**: free-stack (Ollama + local embeddings) not implemented.
- **Security**: no auth, no RLS, service-role used in all routes.
- **Outcome capture**: no UI; no auto-detection from later filings.
- **Score integrity**: hit-rate is 0 until outcomes exist → score not trustworthy.
- **RAG traceability**: RAG citations lack period/title.
- **True streaming**: latency equals full generation.
- **Calculation intent**: no arithmetic/tooling.
- **Peer comparison UI**: none.
- **PDF durability**: originals not stored.
- **Ops**: no tests, logging, rate limiting, cost caps, or deploy target.

## C. MVP readiness score: **52 / 100**

| Dimension | Score | Rationale |
|---|---|---|
| Core pipeline works | 18/20 | End-to-end happy path is solid; build green |
| Differentiating value (scoring) | 6/20 | Computes but not meaningful w/o outcomes |
| Cost goal (free stack) | 3/15 | Designed, not implemented; still paid |
| Security / multi-user | 2/15 | No auth, no RLS |
| RAG quality / citations | 8/15 | Functional but thin + provider-locked |
| Deployability / ops | 5/15 | No host, tests, or guardrails |

**Interpretation**: a credible **technical prototype**, not a deployable MVP.
The skeleton is strong; the value loop and the cost/security goals are unmet.

## D. What prevents deployment today

1. **No authentication + no RLS + service-role everywhere** → open data store.
   (Hard blocker for any shared/public deploy.)
2. **Still requires paid APIs** → violates the near-zero-cost mandate.
3. **No hosting target**; serverless is a poor fit for pdf-parse + planned Ollama
   (needs a persistent Node host/VPS).
4. **Embedding dimension mismatch** for the free stack (1536 vs 768) requires a
   destructive schema change before/with migration.
5. **Credibility feature non-functional** (no outcome capture) → weak core value.
6. **No cost/rate guardrails or observability** → unsafe to expose.

## E. Top 10 highest-priority implementation tasks

1. **Migrate LLM to Ollama** — rewrite `lib/claude.ts` to Ollama `/api/chat`
   (`format:"json"` for extraction/intent), keep function signatures.
2. **Migrate embeddings to local** — `lib/embed.ts` → Ollama `nomic-embed-text`;
   update `schema.sql` to `vector(768)`, recreate index + `match_chunks`.
3. **Build outcome-tracking UI** — wire the existing PATCH into the company
   timeline so users can set met/missed/exceeded/revised (+ actual value).
4. **Make scoring trustworthy** — recompute on outcome change; show
   "insufficient data" state until N resolved outcomes exist.
5. **Add authentication + RLS** — Supabase Auth (or Auth.js); enable RLS, scope
   data per user/org; stop using service-role for user-facing reads.
6. **Define a deploy target** — Dockerfile + compose (Next + Ollama + Postgres
   pgvector) for one-command self-host; document `next start` flow.
7. **Enrich RAG citations** — join chunks → documents to include period/title;
   verify `match_chunks` after the dim change.
8. **Real token streaming** — stream Ollama tokens through the route to the UI.
9. **Persist original PDFs** — store to Supabase Storage / local volume; set
   `storage_path`; add re-process capability.
10. **Add guardrails + smoke tests** — input size limits, basic rate limiting,
    structured logging, and tests for extraction/chunking/agent routing.

> Sequencing: 1–2 (free stack) and 5 (security) unblock the cost + deploy goals;
> 3–4 restore the core value proposition; 6 makes it shippable.
