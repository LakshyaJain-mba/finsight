# PROJECT_AUDIT.md

> Brutally honest audit of FinSight as it exists in the repo today, measured
> against the agreed **free-stack target** (Ollama + local embeddings + Supabase
> free tier / self-hosted Postgres+pgvector).

## TL;DR

The **happy-path pipeline works end-to-end** (build, lint, and typecheck are
green): create company → upload transcript → extract guidance → embed/store →
score → chat with citations. But it is a **single-user, unsecured, paid-API
prototype**. The "free stack" is **designed and documented, not implemented** —
the code still calls Anthropic and OpenAI/Voyage. The flagship feature
(management credibility) is **not yet meaningful** because outcomes are never
captured. It is not deployable to real users as-is.

## Architecture: target vs. actual

| Layer | Target (free stack) | Actual in code | Gap |
|---|---|---|---|
| LLM | Ollama `llama3.1:8b` / `qwen2.5:7b` | Anthropic Claude (Haiku/Sonnet) | **Not migrated** |
| Embeddings | Ollama `nomic-embed-text` (768-d) | OpenAI/Voyage (1536-d) | **Not migrated** + schema dim mismatch |
| DB / vector | Supabase free / self-host PG+pgvector | Supabase (`supabase-js`) | OK (keep) |
| PDF | pdf-parse (local) | pdf-parse v2 (local) | OK |
| Auth | (deferred) | none | No authn/z, no RLS |
| Hosting | self-host `next start` (Node) | none configured | No deploy target |

## Critical findings

1. **No security boundary.** Every API route uses the Supabase **service-role**
   key, and `schema.sql` enables **no RLS**. Any visitor can read/write all
   companies, documents, and guidance. Hard blocker for any shared deployment.
2. **Still paid.** Core goal is ~$0 recurring cost; code requires
   `ANTHROPIC_API_KEY` + an embedding key. Free-stack migration is the single
   biggest outstanding workstream.
3. **Credibility score is hollow.** `guidance_outcomes` default to `pending`
   and there is **no UI** (and no automated detection) to mark met/missed.
   Until then `guidance_hit_rate` is always 0 and the score is essentially a
   function of hedge ratio — the product's main differentiator is non-functional.
4. **Embedding dimension lock.** `document_chunks.embedding` is `vector(1536)`.
   Moving to `nomic-embed-text` (768) requires dropping/recreating the table,
   the ivfflat index, and the `match_chunks` signature, plus re-embedding.
5. **Streaming is cosmetic.** `/api/chat` computes the full answer, then re-emits
   it word-by-word. No real token streaming, so latency = full generation time.
6. **RAG citations are thin.** `document_rag` citations have empty `period`
   (no join back to `documents`), reducing answer traceability.
7. **No file durability.** `documents.storage_path` is unused; only `raw_text`
   is stored. Original PDFs are discarded.
8. **No tests, no logging, no rate limiting, no cost guardrails.**

## Risk register

| Risk | Severity | Note |
|---|---|---|
| Open data access (no auth/RLS) | High | Blocks multi-user deploy |
| Paid-API dependency vs. cost goal | High | Migration not started |
| Schema/embedding rework | Medium | One-time, but destructive to existing rows |
| LLM quality drop after Ollama swap | Medium | JSON extraction reliability on 7–8B models |
| Serverless incompatibility | Medium | pdf-parse + Ollama favor a Node host |
| Score correctness | High | Outcome capture missing |
