// Timeframe Grammar — implementation of Spec v1.0 §3 (FROZEN).
// Indian fiscal year: 1 April → 31 March. FYxx = year ending March 20xx.

export interface TimeframeResult {
  target_period: string | null; // canonical token, e.g. FY2025, FY2025-Q3, FY2025..FY2027
  canonical: string | null;
  horizon_inferred: boolean;
  confidence_p: number;
}

function normalizeFyYear(num: number): number {
  if (num >= 1900) return num; // already 4-digit
  if (num < 100) return 2000 + num; // 2-digit → 20xx
  return num;
}

function fyToken(year: number): string {
  return `FY${normalizeFyYear(year)}`;
}

/** Extract the anchor fiscal year (number, 4-digit) from a statement period. */
function anchorFy(statementPeriod: string): number | null {
  const m = statementPeriod.match(/FY\s*'?(\d{2,4})/i);
  if (m) return normalizeFyYear(parseInt(m[1], 10));
  return null;
}

const VAGUE_HORIZONS: { re: RegExp; years: number }[] = [
  { re: /near[\s-]?term/i, years: 1 },
  { re: /medium[\s-]?term/i, years: 3 },
  { re: /long[\s-]?term/i, years: 5 },
  { re: /steady[\s-]?state/i, years: 4 },
  { re: /over the cycle/i, years: 4 },
];

/**
 * Parse a free-text timeframe into a canonical period token.
 * Confidence: explicit FY/Q/H = 1.0, explicit multi-year = 0.9,
 * inferred from vague horizon = 0.6, unparseable = 0.3.
 */
export function parseTimeframe(raw: string, statementPeriod: string): TimeframeResult {
  const text = (raw ?? '').trim();
  if (!text) {
    return { target_period: null, canonical: null, horizon_inferred: false, confidence_p: 0.3 };
  }

  // Quarter: Q3FY25, Q3 FY25, 3QFY25
  let m = text.match(/Q\s*([1-4])\s*FY\s*'?(\d{2,4})/i) || text.match(/([1-4])Q\s*FY\s*'?(\d{2,4})/i);
  if (m) {
    const tok = `${fyToken(parseInt(m[2], 10))}-Q${m[1]}`;
    return { target_period: tok, canonical: tok, horizon_inferred: false, confidence_p: 1.0 };
  }

  // Half: H1FY25, H2 FY25
  m = text.match(/H\s*([12])\s*FY\s*'?(\d{2,4})/i);
  if (m) {
    const tok = `${fyToken(parseInt(m[2], 10))}-H${m[1]}`;
    return { target_period: tok, canonical: tok, horizon_inferred: false, confidence_p: 1.0 };
  }

  // Multi-year explicit span: FY25-27, FY25 to FY27, FY2025-FY2027
  m = text.match(/FY\s*'?(\d{2,4})\s*(?:-|–|to)\s*(?:FY\s*'?)?(\d{2,4})/i);
  if (m) {
    const a = fyToken(parseInt(m[1], 10));
    const b = fyToken(parseInt(m[2], 10));
    const tok = `${a}..${b}`;
    return { target_period: tok, canonical: tok, horizon_inferred: false, confidence_p: 0.9 };
  }

  // "by FY27" → terminal target
  m = text.match(/by\s+FY\s*'?(\d{2,4})/i);
  if (m) {
    const tok = fyToken(parseInt(m[1], 10));
    return { target_period: tok, canonical: tok, horizon_inferred: false, confidence_p: 0.9 };
  }

  // Single FY: FY25, FY2025, "this fiscal" handled below
  m = text.match(/FY\s*'?(\d{2,4})/i);
  if (m) {
    const tok = fyToken(parseInt(m[1], 10));
    return { target_period: tok, canonical: tok, horizon_inferred: false, confidence_p: 1.0 };
  }

  const anchor = anchorFy(statementPeriod);

  // "next N years/quarters" → inferred span anchored to statement FY
  m = text.match(/next\s+(\d+)\s+year/i);
  if (m && anchor) {
    const n = parseInt(m[1], 10);
    const tok = `${fyToken(anchor)}..${fyToken(anchor + n)}`;
    return { target_period: tok, canonical: tok, horizon_inferred: true, confidence_p: 0.6 };
  }
  m = text.match(/next\s+(\d+)\s+quarter/i);
  if (m && anchor) {
    const tok = fyToken(anchor + 1);
    return { target_period: tok, canonical: tok, horizon_inferred: true, confidence_p: 0.6 };
  }

  // Vague horizons → mapped range (lower confidence)
  for (const { re, years } of VAGUE_HORIZONS) {
    if (re.test(text) && anchor) {
      const tok = years <= 1 ? fyToken(anchor + 1) : `${fyToken(anchor)}..${fyToken(anchor + years)}`;
      return { target_period: tok, canonical: tok, horizon_inferred: true, confidence_p: 0.6 };
    }
  }

  // "this year"/"current year"/"this fiscal" → anchor FY
  if (/(this|current)\s+(year|fiscal|fy)/i.test(text) && anchor) {
    const tok = fyToken(anchor);
    return { target_period: tok, canonical: tok, horizon_inferred: true, confidence_p: 0.6 };
  }

  return { target_period: null, canonical: null, horizon_inferred: false, confidence_p: 0.3 };
}
