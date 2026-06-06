// Shared helpers for the evaluation scaffold.
// No fabricated data: refuses the example/template file and empty label sets.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// EVALUATION_FRAMEWORK.md thresholds (PASS / FAIL bands).
export const THRESHOLDS = {
  extraction_f1: { pass: 0.85, fail: 0.8 },
  extraction_recall: { pass: 0.85, fail: 0.8 }, // used when labels are not exhaustive (R1)
  duplicate_detection: { pass: 0.85, fail: 0.8 },
  timeframe_accuracy: { pass: 0.9, fail: 0.85 },
  retrieval_hit_at_5: { pass: 0.8, fail: 0.7 },
  citation_accuracy: { pass: 0.9, fail: 0.85 },
};

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LABELS_PATH = process.env.GOLDEN_LABELS || 'data/golden_labels.json';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_DIMS = 1536;

export function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function loadGoldenLabels() {
  if (!existsSync(LABELS_PATH)) {
    console.error(
      `FAIL: ${LABELS_PATH} not found. Copy data/golden_labels.example.json -> ${LABELS_PATH} and label it by hand.`
    );
    process.exit(2);
  }
  const labels = JSON.parse(readFileSync(LABELS_PATH, 'utf8'));
  if (labels.version === 'EXAMPLE-DO-NOT-USE') {
    console.error('FAIL: refusing to evaluate the example template. Provide real labels.');
    process.exit(2);
  }
  if (!Array.isArray(labels.transcripts) || labels.transcripts.length === 0) {
    console.error('FAIL: golden_labels.json has no transcripts.');
    process.exit(2);
  }
  return labels;
}

export function supabaseService() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    process.exit(2);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// L2-normalise to match lib/embed.ts behavior for non-default dims.
function l2normalize(v) {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm > 0 ? v.map((x) => x / norm) : v;
}

// R2: embed the query through the SAME provider/path the app uses
// (gemini-embedding-001, RETRIEVAL_QUERY, 1536-dim, L2-normalised) so hit@5 is
// computed from a real vector, not the LLM answer text.
export async function embedQuery(text) {
  loadEnvLocal();
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY required to embed eval queries (R2 real retrieval).');
  }
  const res = await fetch(
    `${GEMINI_API_BASE}/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: String(text).slice(0, 8000) }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: EMBED_DIMS,
      }),
    }
  );
  if (!res.ok) throw new Error(`embedQuery failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const values = json.embedding?.values;
  if (!values?.length) throw new Error('embedQuery returned no values');
  return l2normalize(values);
}

export const lc = (s) => String(s ?? '').toLowerCase();
export const containsAll = (hay, needles) => needles.every((n) => lc(hay).includes(lc(n)));
export const containsAny = (hay, needles) => needles.some((n) => lc(hay).includes(lc(n)));

// PASS / CONDITIONAL / FAIL classification against a threshold band.
export function classify(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t) return 'UNKNOWN';
  if (value >= t.pass) return 'PASS';
  if (value < t.fail) return 'FAIL';
  return 'CONDITIONAL';
}

export function f1(precision, recall) {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function round(n, d = 4) {
  return Number.isFinite(n) ? Number(n.toFixed(d)) : null;
}

// R3: verdict gate. Any CRITICAL failure forces NO-GO regardless of band scores.
export function overallVerdict(scorecard) {
  if (Array.isArray(scorecard.critical_failures) && scorecard.critical_failures.length > 0) {
    return 'NO-GO';
  }
  const states = Object.values(scorecard.metrics).map((m) => m.status);
  if (states.includes('FAIL')) return 'NO-GO';
  if (states.includes('CONDITIONAL')) return 'CONDITIONAL';
  return 'GO';
}

export function printScorecard(scorecard) {
  console.log('\n=== SCORECARD ===');
  for (const [name, m] of Object.entries(scorecard.metrics)) {
    const t = THRESHOLDS[name];
    console.log(
      `${m.status.padEnd(11)} ${name.padEnd(22)} value=${m.value ?? 'n/a'} ` +
        `(pass>=${t?.pass ?? '?'}, fail<${t?.fail ?? '?'}) ${m.detail ?? ''}`
    );
  }
  const crit = scorecard.critical_failures ?? [];
  if (crit.length > 0) {
    console.log(`\nCRITICAL FAILURES (${crit.length}) — forces NO-GO:`);
    for (const c of crit) console.log(`  ✗ ${c.type}: ${c.detail}`);
  } else {
    console.log('\nCRITICAL FAILURES: none');
  }
  console.log(`\nVERDICT: ${scorecard.verdict}`);
  console.log('JSON_SCORECARD ' + JSON.stringify(scorecard));
}
