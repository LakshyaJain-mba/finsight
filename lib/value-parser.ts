// Value Parser — implementation of Spec v1.0 §4.4 value normalization (FROZEN).
// Converts free-text guidance/actual values into a structured ParsedValue.
import type { ParsedValue } from '@/types';

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
 * Parse a raw value string into a ParsedValue. `metricKey` is accepted for
 * future metric-specific handling; defaults are metric-agnostic.
 */
export function parseValue(raw: string | null, _metricKey?: string): ParsedValue {
  if (raw == null) return empty(null, 0);
  const text = String(raw).trim();
  if (!text) return empty(text, 0);

  const unit = detectUnit(text);
  const isBps = /bps|basis point/i.test(text);

  // Phrase-mapped bands (qualitative numerics).
  for (const { re, build } of PHRASES) {
    if (re.test(text)) {
      const part = build();
      return {
        type: part.type ?? 'range',
        low: part.low ?? null,
        high: part.high ?? null,
        unit: '%',
        direction: null,
        raw: text,
        confidence_v: 0.8,
      };
    }
  }

  // Range: "14-16%", "14 to 16", "between 14 and 16", "14–16"
  let m = text.match(/(-?\d[\d,]*\.?\d*)\s*(?:-|–|to|and)\s*(-?\d[\d,]*\.?\d*)/i);
  if (m) {
    let low = num(m[1]);
    let high = num(m[2]);
    if (unit === '₹ cr') {
      low = toCrore(low, text);
      high = toCrore(high, text);
    }
    if (isBps) {
      low /= 100;
      high /= 100;
    }
    return { type: 'range', low, high, unit: unit ?? null, direction: null, raw: text, confidence_v: 1.0 };
  }

  // Threshold: "at least / minimum / north of / >" (lower bound)
  //            "below / under / less than / <" (upper bound)
  const lowerBound = /(at least|minimum|north of|greater than|more than|above|over|>=|>)/i.test(text);
  const upperBound = /(below|under|less than|maximum|upto|up to|<=|<)/i.test(text);
  m = text.match(/(-?\d[\d,]*\.?\d*)/);
  if (m && (lowerBound || upperBound)) {
    let v = num(m[1]);
    if (unit === '₹ cr') v = toCrore(v, text);
    if (isBps) v /= 100;
    return {
      type: 'threshold',
      low: lowerBound ? v : null,
      high: upperBound ? v : null,
      unit: unit ?? null,
      direction: null,
      raw: text,
      confidence_v: 1.0,
    };
  }

  // Point: a single number with/without unit
  if (m) {
    let v = num(m[1]);
    if (unit === '₹ cr') v = toCrore(v, text);
    if (isBps) v /= 100;
    return { type: 'point', low: v, high: v, unit: unit ?? null, direction: null, raw: text, confidence_v: 1.0 };
  }

  // Directional (no numbers): improve/increase vs reduce/decline, or flat
  if (/(flat|flattish|stable|maintain|steady)/i.test(text)) {
    return { type: 'directional', low: null, high: null, unit: unit ?? null, direction: 'flat', raw: text, confidence_v: 0.7 };
  }
  if (/(improv|increas|grow|higher|expand|rise|ramp|accelerat|strengthen)/i.test(text)) {
    return { type: 'directional', low: null, high: null, unit: unit ?? null, direction: 'up', raw: text, confidence_v: 0.7 };
  }
  if (/(reduc|declin|lower|decreas|deleverag|moderat|soften|contract)/i.test(text)) {
    return { type: 'directional', low: null, high: null, unit: unit ?? null, direction: 'down', raw: text, confidence_v: 0.7 };
  }

  return empty(text, 0.5);
}
