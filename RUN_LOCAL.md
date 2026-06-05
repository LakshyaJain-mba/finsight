# RUN_LOCAL.md — Run FinSight locally on Windows 11

First-time setup for the **Phase A** build.

- **Repository:** `LakshyaJain-mba/finsight`
- **Branch:** `phase-a-guidance-accountability` (the code is on this branch; `main` is empty)
- **Stack:** Next.js 14 (App Router) + Supabase (Postgres + pgvector) + Gemini 2.5 Flash

> **Phase A note:** outcome capture is **manual** (no auto-resolution yet). Embeddings
> are **optional** for Phase A — without an embedding key, document upload, guidance
> extraction, normalization, revision detection, outcome capture, and the credibility
> score all still work; only the RAG chat retrieval is disabled.

---

## 0. Prerequisites (install once)

| Tool | Version | Where |
|---|---|---|
| Git for Windows | latest | https://git-scm.com/download/win |
| Node.js (LTS) | **20.x** (Next 14 needs ≥ 18.17) | https://nodejs.org (choose **LTS**, includes npm) |
| Supabase account | free tier | https://supabase.com |
| Google AI Studio key | — | https://aistudio.google.com/apikey (for `GEMINI_API_KEY`) |
| (Optional) OpenAI **or** Voyage key | — | https://platform.openai.com / https://www.voyageai.com (embeddings for chat) |

Use **Windows PowerShell** (or Windows Terminal) for all commands below. Verify the toolchain:

```powershell
node -v   # expect v20.x (must be >= 18.17)
npm -v
git --version
```

If `node -v` shows an older version, uninstall it and reinstall the Node 20 LTS, or use
[nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 20` then `nvm use 20`.

---

## 1. Clone the repository (the Phase A branch)

```powershell
cd $HOME\Documents
git clone -b phase-a-guidance-accountability https://github.com/LakshyaJain-mba/finsight.git
cd finsight
```

Confirm you are on the right branch:

```powershell
git branch --show-current   # expect: phase-a-guidance-accountability
```

> Tip: avoid cloning into a OneDrive-synced folder — file locking during `npm install`
> can cause errors. `C:\dev\finsight` is a safe location.

---

## 2. Install Node.js dependencies

```powershell
npm install
```

This reads `package-lock.json` and installs the exact dependency versions. It takes a
few minutes the first time. Warnings are fine; errors are not (see Troubleshooting).

---

## 3. Create a Supabase project

1. Sign in at https://supabase.com → **New project**.
2. Name it `finsight`, set a **strong database password** (save it), pick the nearest region.
3. Wait until the project status is **Active** (~2 minutes).
4. Open **Project Settings → API** and copy these three values — you'll need them in step 5:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Project API keys → `service_role` `secret`** → `SUPABASE_SERVICE_ROLE_KEY`

> The `service_role` key is a server-only secret used by the API routes. Never expose
> it in client code or commit it.

---

## 4. Apply the database schema

A brand-new database only needs **`supabase/schema.sql`** — it already contains every
table, index, the `pgvector` extension, the `match_chunks` function, **and** all Phase A
columns/tables. You do **not** need the migration file for a fresh project.

1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from the cloned repo, copy its **entire** contents, paste
   into the editor.
3. Click **Run**. You should see "Success. No rows returned."

> `supabase/migrations/001_accountability_schema.sql` is **only** for upgrading a database
> that was created with an older schema. Skip it on a fresh project (running it after
> `schema.sql` is harmless but unnecessary).

Verify the tables exist (run in SQL Editor):

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expect: `companies`, `document_chunks`, `documents`, `extracted_actuals`,
`guidance_outcomes`, `guidance_statements`, `management_scores`, `revision_events`.

---

## 5. Create `.env.local`

From the repo root:

```powershell
copy .env.local.example .env.local
notepad .env.local
```

Fill it in:

```dotenv
GEMINI_API_KEY=AIza...                       # from aistudio.google.com/apikey
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret key>

# Optional (chat RAG). Set ONE; Voyage is used if present, else OpenAI.
OPENAI_API_KEY=
VOYAGE_API_KEY=
```

Save and close. **Restart the dev server after any `.env.local` change** — env values
are read at startup.

---

## 6. Run the application

```powershell
npm run dev
```

Open **http://localhost:3000** — it redirects to `/dashboard`. On a fresh DB the dashboard
shows an empty state ("No companies yet").

Stop the server with `Ctrl + C`.

---

## 7. Verify database connectivity

- If `/dashboard` loads (even empty), the app reached Supabase successfully.
- If you see a runtime error, check the **PowerShell terminal** running `npm run dev` for
  the message (e.g., "Missing environment variable…" or a fetch error) and see Troubleshooting.
- Optional direct check — in Supabase SQL Editor:

```sql
select count(*) from companies;   -- returns 0 on a fresh DB = connected + schema OK
```

---

## 8. Upload your first company document

1. Click **Upload** (top nav) → `/upload`.
2. In **Company**, choose **+ Create new company**: enter a ticker (e.g., `INFY`) and name
   (`Infosys`), then **Create**.
3. Set **Period** = `Q2FY25`, **Document type** = `concall`.
4. Use the **Paste Text** tab and paste a transcript. For a first test you can use this
   sample (it contains several forward-looking statements):

   > "On the outlook, we expect revenue growth of 14 to 16 percent in constant currency
   > for FY25. We are targeting an EBITDA margin of around 21 percent for the full year.
   > Management plans capex of about 500 crore in FY25. We aim to reduce net debt over the
   > next two years. We are confident demand will improve in the second half."

5. Click **Process Document**. After processing you'll see a **ConcallCard** with the
   management tone, a guidance table, summary, and key themes.

> If you set an embedding key, you'll also see chunks indexed. If not, you'll see a
> non-blocking warning — that's expected in Phase A.

---

## 9. Test Phase A functionality

**a) Normalization (M1)** — open `/company/INFY`. The guidance timeline groups items by
**target period** (e.g., `FY2025`) and each row shows a canonical metric (e.g.,
`REVENUE_GROWTH`, `EBITDA_MARGIN`, `CAPEX`, `NET_DEBT`). The credibility gauge shows
**Provisional** with coverage `0 of N resolved`.

**b) Outcome capture + scoring (M4)** — under any statement, use the inline editor: set an
**Outcome** (e.g., `met`), enter an **Actual value** (e.g., `15%`), add a note, click
**Save**. The credibility score recomputes immediately. Resolve **5+** statements and the
badge flips from **Provisional** to **Rated**.

**c) Review queue (M4)** — click **Review** in the top nav (or the dashboard
"N awaiting outcome" chip) → `/review` lists all pending statements for quick resolution.

**d) Revision detection (M1)** — upload a **second** document for `INFY` (Period `Q3FY25`,
type `concall`) whose text revises the same metric, e.g.:

   > "We now expect FY25 revenue growth of 12 to 14 percent in constant currency."

Re-open `/company/INFY`: the earlier FY2025 revenue-growth statement is **superseded** by
the new one (a revision event is recorded). The active timeline reflects the latest guidance.

If all four behave as described, Phase A is working on your machine.

---

## Troubleshooting (common errors)

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Missing environment variable: NEXT_PUBLIC_SUPABASE_URL` (or similar) | `.env.local` missing/typo, or server started before saving it | Check `.env.local` in repo root, then **restart** `npm run dev` |
| `type "vector" does not exist` when running schema | pgvector not enabled | The `create extension if not exists vector;` line handles it; if it fails, go to **Database → Extensions**, search **vector**, enable, then re-run `schema.sql` |
| Upload fails: model **404 / "model not found"** from Gemini | The model ID in `lib/claude.ts` (`MODELS`) isn't available to your key/region | Confirm `gemini-2.5-flash` is enabled for your key, or set `MODELS` to a model your key can access; restart |
| Gemini **400 / 403 / API key not valid** | Bad/unset `GEMINI_API_KEY` or API not enabled | Re-copy the key from aistudio.google.com/apikey; ensure the Generative Language API is enabled; restart |
| Upload shows a warning "No embedding provider configured" | No `OPENAI_API_KEY`/`VOYAGE_API_KEY` | Expected in Phase A — guidance + scoring still work. Set a key only if you want chat RAG |
| `relation "companies" does not exist` | `schema.sql` not applied (or applied to a different project) | Re-run `schema.sql` in the **same** project whose keys are in `.env.local` |
| PDF upload error / empty extraction | Scanned/image PDF (no text layer) | Use a text-based PDF, or use the **Paste Text** tab |
| `Port 3000 is already in use` | Another process on 3000 | `npm run dev -- -p 3001` then open http://localhost:3001 |
| `npm install` fails with EPERM / file lock | Folder is in OneDrive/antivirus-locked | Move repo to `C:\dev\finsight`, delete `node_modules`, run `npm install` again |
| Node engine / syntax errors on `npm run dev` | Node < 18.17 | Install Node 20 LTS (`node -v` to confirm) |
| 401 / RLS errors on reads | Using `anon` key where `service_role` is expected | Ensure `SUPABASE_SERVICE_ROLE_KEY` is the **service_role secret**, not the anon key |
| Dashboard error mentioning `fetch failed` | Wrong `NEXT_PUBLIC_SUPABASE_URL` or no internet | Verify the Project URL (looks like `https://<ref>.supabase.co`) |
| `.env.local` committed by mistake | — | It is git-ignored by default; never force-add it |

---

## Quick reference

```powershell
git clone -b phase-a-guidance-accountability https://github.com/LakshyaJain-mba/finsight.git
cd finsight
npm install
copy .env.local.example .env.local   # then edit values
# (apply supabase/schema.sql in the Supabase SQL editor)
npm run dev                           # http://localhost:3000
```

Useful scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.
