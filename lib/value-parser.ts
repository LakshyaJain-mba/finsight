// Value Parser — implementation of Spec v1.0 §4.4 value normalization.
// Converts free-text guidance/actual values into a structured ParsedValue.
//
// P2 (audit fix): metric-aware unit validation. When the metric's canonical
// unit is rate-like (%, bps, x) we never store the value as currency (₹ cr),
// and vice-versa — preventing the "EBITDA margin = 20 crore" class of error.
import type { ParsedValue } from '@/types';
import { getMetricConfig } from './taxonomy';

function empty(raw: string | null, confidence_v = 0): ParsedValue {
  return { type: null, low: null, high: null, unit: null, direction: null, raw, confidence_v };
}

// Phrase lexicon (Spec v1.0 §4.4) → mapped numeric bands (unit %).
const PHRASES: { re: RegExp; build: () => Partial<ParsedValue> }[] = [
  { re: /low[\s-]?single[\s-]?digit/i, build: () => ({ type: 'range', low: 1, high: 3 }) },
  { re: /mid[\s-]?single[\s-]?digit/i, build: () => ({ type: 'range', low: 4, high: 6 }) },
  { re: /high[\s-]?single[\s-]?digit/i, build: () => ({ type: 'range', low: 7, high: 9 }) },
  { re: /low[\s-]?double[\s-]?digit/i, build: () => ({ type: 'range', low: 10, high: 13 }) },
  { re: /mid[\s-]?teens?/i, build: () => ({ type: 'range', low: 14, high: 16 }) },
  { re: /high[\s-]?teens?/i, build: () => ({ type: 'range', low: 17, high: 19 }) },
  { re: /double[\s-]?digit/i, build: () => ({ type: 'threshold', low: 10, high: null }) },
];

// The unit "family" a metric expects, derived from its taxonomy unit.
type UnitFamily = 'rate' | 'currency' | 'days' | 'multiple' | 'other' | null;

function metricUnitFamily(metricKey?: string): UnitFamily {
  if (!metricKey || metricKey === 'OTHER') return null;
  const cfg = getMetricConfig(metricKey);
  if (!cfg) return null;
  switch (cfg.unit) {
    case '%':
    case '% YoY':
      return 'rate';
    case '₹ cr':
    case '₹':
    case '₹/unit':
      return 'currency';
    case 'days':
      return 'days';
    case 'x':
      return 'multiple';
    default:
      return 'other';
  }
}

function detectUnit(text: string): string | null {
  if (/%|percent|per cent|bps|basis point/i.test(text)) return '%';
  if (/\b(x|times)\b/i.test(text)) return 'x';
  if (/₹|rs\.?|inr|cr\b|crore|lakh/i.test(text)) return '₹ cr';
  if (/\bdays?\b/i.test(text)) return 'days';
  return null;
}

function toCrore(value: number, text: string): number {
  if (/lakh/i.test(text)) return value / 100; // 1 lakh = 0.01 cr
  return value; // assume crore by default for INR figures
}

function num(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

/**
 * Reconcile the unit detected from the text with the unit the metric expects.
 * Returns the unit to store plus whether a currency conversion should apply.
 * When the text's unit contradicts a known rate/multiple metric, we trust the
 * metric (a margin is never ₹ cr) and drop the spurious currency conversion.
 */
function reconcileUnit(
  detected: string | null,
  family: UnitFamily,
  hasCurrencyCue: boolean
): { unit: string | null; applyCrore: boolean; mismatch: boolean } {
  if (family === 'rate') {
    // Margin/ratio/growth metric: force %, never currency.
    return { unit: '%', applyCrore: false, mismatch: detected === '₹ cr' };
  }
  if (family === 'multiple') {
    return { unit: 'x', applyCrore: false, mismatch: detected === '₹ cr' || detected === '%' };
  }
  if (family === 'days') {
    return { unit: 'days', applyCrore: false, mismatch: detected === '₹ cr' || detected === '%' };
  }
  if (family === 'currency') {
    // Currency metric: keep ₹ cr; only convert when a currency cue is present.
    return { unit: '₹ cr', applyCrore: hasCurrencyCue, mismatch: detected === '%' };
  }
  // Unknown metric family: fall back to the detected unit (legacy behavior).
  return { unit: detected, applyCrore: detected === '₹ cr', mismatch: false };
}

/**
 * Parse a raw value string into a ParsedValue. `metricKey` enables metric-aware
 * unit validation (P2); when omitted the parser is metric-agnostic (legacy).
 */
export function parseValue(raw: string | null, metricKey?: string): ParsedValue {
  if (raw == null) return empty(null, 0);
  const text = String(raw).trim();
  if (!text) return empty(text, 0);

  const detected = detectUnit(text);
  const family = metricUnitFamily(metricKey);
  const isBps = /bps|basis point/i.test(text);
  const hasCurrencyCue = /₹|rs\.?|inr|cr\b|crore|lakh/i.test(text);

  const { unit, applyCrore, mismatch } = reconcileUnit(detected, family, hasCurrencyCue);
  // A unit mismatch (e.g. "20 crore" for a margin) means the source value is
  // suspect; lower confidence so it routes to review rather than auto-confirm.
  const confPenalty = mismatch ? 0.5 : 1.0;

  // Phrase-mapped bands (qualitative numerics) — inherently percentage.
  for (const { re, build } of PHRASES) {
    if (re.test(text)) {
      const part = build();
      return {
        type: part.type ?? 'range',
        low: part.low ?? null,
        high: part.high ?? null,
        unit: family === 'rate' || family == null ? '%' : unit,
        direction: null,
        raw: text,
        confidence_v: 0.8 * confPenalty,
        unit_mismatch: mismatch,
      };
    }
  }

  // Range: "14-16%", "14 to 16", "between 14 and 16", "14–16"
  let m = text.match(/(-?\d[\d,]*\.?\d*)\s*(?:-|–|to|and)\s*(-?\d[\d,]*\.?\d*)/i);
  if (m) {
    let low = num(m[1]);
    let high = num(m[2]);
    if (applyCrore) {
      low = toCrore(low, text);
      high = toCrore(high, text);
    }
    if (isBps) {
      low /= 100;
      high /= 100;
    }
    return { type: 'range', low, high, unit, direction: null, raw: text, confidence_v: 1.0 * confPenalty, unit_mismatch: mismatch };
  }

  // Threshold: "at least / minimum / north of / >" (lower bound)
  //            "below / under / less than / <" (upper bound)
  const lowerBound = /(at least|minimum|north of|greater than|more than|above|over|>=|>)/i.test(text);
  const upperBound = /(below|under|less than|maximum|upto|up to|<=|<)/i.test(text);
  m = text.match(/(-?\d[\d,]*\.?\d*)/);
  if (m && (lowerBound || upperBound)) {
    let v = num(m[1]);
    if (applyCrore) v = toCrore(v, text);
    if (isBps) v /= 100;
    return {
      type: 'threshold',
      low: lowerBound ? v : null,
      high: upperBound ? v : null,
      unit,
      direction: null,
      raw: text,
      confidence_v: 1.0 * confPenalty,
      unit_mismatch: mismatch,
    };
  }

  // Point: a single number with/without unit
  if (m) {
    let v = num(m[1]);
    if (applyCrore) v = toCrore(v, text);
    if (isBps) v /= 100;
    return { type: 'point', low: v, high: v, unit, direction: null, raw: text, confidence_v: 1.0 * confPenalty, unit_mismatch: mismatch };
  }

  // Directional (no numbers): improve/increase vs reduce/decline, or flat
  if (/(flat|flattish|stable|maintain|steady)/i.test(text)) {
    return { type: 'directional', low: null, high: null, unit, direction: 'flat', raw: text, confidence_v: 0.7 };
  }
  if (/(improv|increas|grow|higher|expand|rise|ramp|accelerat|strengthen)/i.test(text)) {
    return { type: 'directional', low: null, high: null, unit, direction: 'up', raw: text, confidence_v: 0.7 };
  }
  if (/(reduc|declin|lower|decreas|deleverag|moderat|soften|contract)/i.test(text)) {
    return { type: 'directional', low: null, high: null, unit, direction: 'down', raw: text, confidence_v: 0.7 };
  }

  return empty(text, 0.5);
}
