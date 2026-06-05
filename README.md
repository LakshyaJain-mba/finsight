# FinSight

A financial intelligence platform that tracks **management guidance** from earnings
calls, scores **management credibility** over time, and lets you **chat** with your
analyzed documents using a retrieval-augmented agent.

Built as a single Next.js 14 app (App Router) — no separate backend server.

- **Frontend + API:** Next.js 14 (App Router, route handlers)
- **Database + Vector store:** Supabase (Postgres + pgvector)
- **LLM:** Claude (Anthropic) — Haiku for extraction/routing, Sonnet for synthesis
- **Embeddings:** OpenAI `text-embedding-3-small` or Voyage `voyage-finance-2`
- **UI:** Tailwind CSS + shadcn-style components + lucide-react

## How it works

1. **Upload** a transcript (PDF or pasted text) → `/api/process-document`:
   - Extracts text (pdf-parse), chunks it (1500 chars / 200 overlap).
   - Runs Claude Haiku to extract forward-looking **guidance statements**.
   - Generates embeddings per chunk and stores them in `document_chunks`.
   - Recomputes the company's **management credibility score**.
2. **Dashboard** shows a credibility widget per company + recent documents.
3. **Company page** renders a guidance **timeline** with promised vs. actual outcomes.
4. **Chat** routes each query through an agent (`lib/agent.ts`):
   - `guidance_lookup` → structured DB query
   - `document_rag` → pgvector similarity search (`match_chunks`)
   - `peer_comparison` → management scores across companies
   - Answer synthesized by Claude Sonnet with citations.

## Project structure

```
app/            App Router pages + API route handlers
components/      UI + feature components (ConcallCard, GuidanceTimeline, ...)
components/ui/   shadcn-style primitives (button, card, badge, ...)
lib/             supabase, claude, prompts, extract, embed, agent
types/           Shared TypeScript types
supabase/        schema.sql (tables, indexes, match_chunks function)
```

---

## Setup checklist

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at https://supabase.com.
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Deploy the database schema

The schema enables the `vector` extension, creates all tables/indexes, and adds the
`match_chunks` function. Run it via the Supabase SQL editor (paste the file contents)
or with the Supabase CLI:

```bash
# Option A — Supabase CLI (linked project)
supabase db execute --file supabase/schema.sql

# Option B — psql against the connection string from Project Settings → Database
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; used by route handlers |
| `OPENAI_API_KEY` | one of | Embeddings via `text-embedding-3-small` |
| `VOYAGE_API_KEY` | one of | Embeddings via `voyage-finance-2` (preferred if set) |

> At least one embedding provider key is required for chat RAG. Without it, document
> upload still works (guidance extraction + scoring); only vector search is disabled.

### 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/dashboard`.

Add a company and upload a transcript from `/upload` to populate the dashboard.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
