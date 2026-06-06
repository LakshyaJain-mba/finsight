// RAG end-to-end validation harness.
//
// Runs the 5 checks against a LIVE Supabase + embedding provider:
//   1. Re-upload a transcript (via /api/process-document on a running dev server)
//   2. document_chunks > 0
//   3. embedding dimension = 1536
//   4. match_chunks returns rows
//   5. chat answer includes citations (via /api/chat)
//
// Usage:
//   1. Fill .env.local (GEMINI_API_KEY + SUPABASE_* keys) and run `npm run dev`.
//   2. node scripts/validate-rag.mjs            # uses a built-in sample transcript
//      node scripts/validate-rag.mjs ./file.pdf # or validate a specific PDF
//
// Requires Node 18+ (global fetch). Reads env from .env.local.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TICKER = process.env.TEST_TICKER || 'RAGTEST';
const PERIOD = process.env.TEST_PERIOD || 'Q2FY25';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const SAMPLE = `Management commentary. On the outlook, we expect revenue growth of 14 to 16
percent in constant currency for FY25. We are targeting an EBITDA margin of around 21
percent for the full year. We plan capex of about 500 crore in FY25 to expand capacity.
We aim to reduce net debt over the next two years and remain confident demand improves
in the second half. On margins, premiumisation and cost efficiency are the key levers.`;

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  // Ensure a clean test company.
  let { data: company } = await supabase.from('companies').select('id').eq('ticker', TICKER).maybeSingle();
  if (!company) {
    const ins = await supabase
      .from('companies')
      .insert({ ticker: TICKER, name: 'RAG Test Co', sector: 'Test' })
      .select('id')
      .single();
    if (ins.error) { record('setup company', false, ins.error.message); return finish(); }
    company = ins.data;
  }

  // 1. Upload transcript via the real API route.
  const form = new FormData();
  form.append('company_id', company.id);
  form.append('period', PERIOD);
  form.append('doc_type', 'concall');
  const pdfArg = process.argv[2];
  if (pdfArg && existsSync(pdfArg)) {
    form.append('file', new Blob([readFileSync(pdfArg)], { type: 'application/pdf' }), 'test.pdf');
  } else {
    form.append('text', SAMPLE);
  }

  let upload;
  try {
    const res = await fetch(`${BASE_URL}/api/process-document`, { method: 'POST', body: form });
    upload = await res.json();
    record('1. upload transcript', res.ok && !upload.error,
      res.ok ? `chunks_stored=${upload.chunks_stored}, statements=${upload.statements_count}${upload.warning ? `, warning="${upload.warning}"` : ''}` : upload.error);
  } catch (e) {
    record('1. upload transcript', false, `dev server not reachable at ${BASE_URL} (${e.message})`);
    return finish();
  }

  // 2. document_chunks > 0
  const { count: chunkCount } = await supabase
    .from('document_chunks').select('id', { count: 'exact', head: true })
    .eq('document_id', upload.document_id);
  record('2. document_chunks > 0', (chunkCount ?? 0) > 0, `count=${chunkCount ?? 0}`);

  // 3. embedding dimension = 1536
  const { data: dimRow, error: dimErr } = await supabase.rpc('exec_dims').maybeSingle?.() ?? { data: null, error: null };
  // exec_dims may not exist; fall back to fetching one row and measuring.
  let dim = null;
  if (!dimRow) {
    const { data: oneChunk } = await supabase
      .from('document_chunks').select('embedding').eq('document_id', upload.document_id).limit(1).maybeSingle();
    if (oneChunk?.embedding) {
      const arr = typeof oneChunk.embedding === 'string' ? JSON.parse(oneChunk.embedding) : oneChunk.embedding;
      dim = Array.isArray(arr) ? arr.length : null;
    }
  }
  record('3. embedding dim = 1536', dim === 1536, `dim=${dim}`);

  // 4. match_chunks returns rows (embed a query via the same provider through the app is ideal;
  //    here we call the RPC with a zero vector only to confirm the function executes + returns rows).
  //    A non-trivial relevance check happens in step 5 via /api/chat.
  const probe = Array.from({ length: 1536 }, () => 0);
  probe[0] = 1;
  const { data: matches, error: matchErr } = await supabase.rpc('match_chunks', {
    query_embedding: probe, ticker_filter: TICKER, match_count: 5,
  });
  record('4. match_chunks returns rows', !matchErr && Array.isArray(matches) && matches.length > 0,
    matchErr ? matchErr.message : `rows=${matches?.length ?? 0}; period on row0="${matches?.[0]?.period ?? ''}"`);

  // 5. chat answer includes citations
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What did management say about margins and revenue growth?', company_ticker: TICKER, history: [] }),
    });
    const text = await res.text();
    const MARKER = '\n__FINSIGHT_CITATIONS__\n';
    const idx = text.indexOf(MARKER);
    let citations = [];
    if (idx !== -1) { try { citations = JSON.parse(text.slice(idx + MARKER.length)); } catch {} }
    record('5. chat includes citations', citations.length > 0, `citations=${citations.length}`);
  } catch (e) {
    record('5. chat includes citations', false, e.message);
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('Harness error:', e); process.exit(1); });
