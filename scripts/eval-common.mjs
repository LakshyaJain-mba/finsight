// Shared helpers for the evaluation scaffold.
// No fabricated data: refuses the example/template file and empty label sets.

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// EVALUATION_FRAMEWORK.md thresholds (PASS / FAIL bands).
export const THRESHOLDS = {
  extraction_f1: { pass: 0.85, fail: 0.8 },
  duplicate_detection: { pass: 0.85, fail: 0.8 },
  timeframe_accuracy: { pass: 0.9, fail: 0.85 },
  retrieval_hit_at_5: { pass: 0.8, fail: 0.7 },
  citation_accuracy: { pass: 0.9, fail: 0.85 },
};

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LABELS_PATH = process.env.GOLDEN_LABELS || 'data/golden_labels.json';

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

export const lc = (s) => String(s ?? '').toLowerCase();
export const containsAll = (hay, needles) => needles.every((n) => lc(hay).includes(lc(n)));
export const containsAny = (hay, needles) => needles.some((n) => lc(hay).includes(lc(n)));

// PASS / WARN(=between) / FAIL classification against a threshold band.
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

// Resolve overall verdict: NO-GO if any FAIL, CONDITIONAL if any in-band, else GO.
export function overallVerdict(scorecard) {
  const states = Object.values(scorecard.metrics).map((m) => m.status);
  if (states.includes('FAIL')) return 'NO-GO';
  if (states.includes('CONDITIONAL')) return 'CONDITIONAL';
  return 'GO';
}

export function printScorecard(scorecard) {
  console.log('\n=== SCORECARD ===');
  for (const [name, m] of Object.entries(scorecard.metrics)) {
    console.log(
      `${m.status.padEnd(11)} ${name.padEnd(22)} value=${m.value ?? 'n/a'} ` +
        `(pass>=${THRESHOLDS[name]?.pass}, fail<${THRESHOLDS[name]?.fail}) ${m.detail ?? ''}`
    );
  }
  console.log(`\nVERDICT: ${scorecard.verdict}`);
  console.log('JSON_SCORECARD ' + JSON.stringify(scorecard));
}
