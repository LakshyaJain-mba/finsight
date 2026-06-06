// Timeframe Grammar — implementation of Spec v1.0 §3.
// Indian fiscal year: 1 April → 31 March. FYxx = year ending March 20xx.
//
// P1 (audit fix): recovers common phrasings that previously yielded NULL
// (bare quarter/half, "financial year 20xx", calendar month+year, "next year")
// and, as a last resort, falls back to the document's own period. All recovered
// or inferred periods are flagged `horizon_inferred = true` with reduced
// confidence so they never silently auto-confirm downstream.

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

/** Canonicalize the document's own period (e.g. "Q2FY25" → "FY2025-Q2"). */
function docPeriodToken(sp: string): string | null {
  const q = sp.match(/Q\s*([1-4])\s*FY\s*'?(\d{2,4})/i) || sp.match(/([1-4])Q\s*FY\s*'?(\d{2,4})/i);
  if (q) return `${fyToken(parseInt(q[2], 10))}-Q${q[1]}`;
  const h = sp.match(/H\s*([12])\s*FY\s*'?(\d{2,4})/i);
  if (h) return `${fyToken(parseInt(h[2], 10))}-H${h[1]}`;
  const fy = sp.match(/FY\s*'?(\d{2,4})/i);
  if (fy) return fyToken(parseInt(fy[1], 10));
  return null;
}

/** The document's quarter number, if it is a quarterly period. */
function docQuarter(sp: string): { q: number; fy: number } | null {
  const q = sp.match(/Q\s*([1-4])\s*FY\s*'?(\d{2,4})/i) || sp.match(/([1-4])Q\s*FY\s*'?(\d{2,4})/i);
  if (q) return { q: parseInt(q[1], 10), fy: normalizeFyYear(parseInt(q[2], 10)) };
  return null;
}

// Map a calendar month (1-12) + calendar year to the Indian fiscal year.
// Apr–Dec belong to FY(year+1); Jan–Mar belong to FY(year).
function calendarToFy(month: number, year: number): number {
  return month >= 4 ? year + 1 : year;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const VAGUE_HORIZONS: { re: RegExp; years: number }[] = [
  { re: /near[\s-]?term/i, years: 1 },
  { re: /medium[\s-]?term/i, years: 3 },
  { re: /long[\s-]?term/i, years: 5 },
  { re: /steady[\s-]?state/i, years: 4 },
  { re: /over the cycle/i, years: 4 },
];

/**
 * Parse a free-text timeframe into a canonical period token.
 * Confidence: explicit FY/Q/H = 1.0; explicit multi-year / "by FY" = 0.9;
 * inferred (vague/relative/recovered) = 0.6; document-period fallback = 0.5;
 * unparseable = 0.3.
 */
export function parseTimeframe(raw: string, statementPeriod: string): TimeframeResult {
  const text = (raw ?? '').trim();
  if (!text) {
    return { target_period: null, canonical: null, horizon_inferred: false, confidence_p: 0.3 };
  }

  const explicit = (tok: string, conf = 1.0): TimeframeResult => ({
    target_period: tok,
    canonical: tok,
    horizon_inferred: false,
    confidence_p: conf,
  });
  const inferred = (tok: string, conf = 0.6): TimeframeResult => ({
    target_period: tok,
    canonical: tok,
    horizon_inferred: true,
    confidence_p: conf,
  });

  // Quarter: Q3FY25, Q3 FY25, 3QFY25
  let m = text.match(/Q\s*([1-4])\s*FY\s*'?(\d{2,4})/i) || text.match(/([1-4])Q\s*FY\s*'?(\d{2,4})/i);
  if (m) return explicit(`${fyToken(parseInt(m[2], 10))}-Q${m[1]}`);

  // Half: H1FY25, H2 FY25
  m = text.match(/H\s*([12])\s*FY\s*'?(\d{2,4})/i);
  if (m) return explicit(`${fyToken(parseInt(m[2], 10))}-H${m[1]}`);

  // Multi-year explicit span: FY25-27, FY25 to FY27, FY2025-FY2027
  m = text.match(/FY\s*'?(\d{2,4})\s*(?:-|–|to)\s*(?:FY\s*'?)?(\d{2,4})/i);
  if (m) {
    const a = fyToken(parseInt(m[1], 10));
    const b = fyToken(parseInt(m[2], 10));
    return explicit(`${a}..${b}`, 0.9);
  }

  // "by FY27" → terminal target
  m = text.match(/by\s+FY\s*'?(\d{2,4})/i);
  if (m) return explicit(fyToken(parseInt(m[1], 10)), 0.9);

  // Single FY: FY25, FY2025
  m = text.match(/FY\s*'?(\d{2,4})/i);
  if (m) return explicit(fyToken(parseInt(m[1], 10)));

  // P1: "financial year 2026" / "fiscal year 2026" / "fiscal 2026"
  m = text.match(/(?:financial|fiscal)\s+(?:year\s+)?'?(\d{2,4})/i);
  if (m) return explicit(fyToken(parseInt(m[1], 10)));

  const anchor = anchorFy(statementPeriod);

  // P1: calendar "by March 2026" / "March 2026" / "by December 2025" → fiscal year
  m = text.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+'?(\d{4})/i
  );
  if (m) {
    const fy = calendarToFy(MONTHS[m[1].toLowerCase()], parseInt(m[2], 10));
    return inferred(fyToken(fy));
  }

  // "next N years/quarters" → inferred span anchored to statement FY
  m = text.match(/next\s+(\d+)\s+year/i);
  if (m && anchor) {
    const n = parseInt(m[1], 10);
    return inferred(`${fyToken(anchor)}..${fyToken(anchor + n)}`);
  }
  m = text.match(/next\s+(\d+)\s+quarter/i);
  if (m && anchor) return inferred(fyToken(anchor + 1));

  // Vague horizons → mapped range (lower confidence)
  for (const { re, years } of VAGUE_HORIZONS) {
    if (re.test(text) && anchor) {
      const tok = years <= 1 ? fyToken(anchor + 1) : `${fyToken(anchor)}..${fyToken(anchor + years)}`;
      return inferred(tok);
    }
  }

  // P1: "next year" / "next fiscal" → anchor + 1
  if (/next\s+(year|fiscal|fy)/i.test(text) && anchor) return inferred(fyToken(anchor + 1));

  // "this year" / "current year" / "this fiscal" → anchor FY
  if (/(this|current|the)\s+(year|fiscal|fy|full year)/i.test(text) && anchor) {
    return inferred(fyToken(anchor));
  }

  // P1: bare quarter without FY — "this quarter", "current quarter", "Q3", "third quarter"
  const dq = docQuarter(statementPeriod);
  if (/(this|current)\s+quarter/i.test(text) && dq) {
    return inferred(`${fyToken(dq.fy)}-Q${dq.q}`);
  }
  if (/next\s+quarter/i.test(text) && dq) {
    const nextQ = dq.q === 4 ? 1 : dq.q + 1;
    const nextFy = dq.q === 4 ? dq.fy + 1 : dq.fy;
    return inferred(`${fyToken(nextFy)}-Q${nextQ}`);
  }
  const ord: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
  m = text.match(/\bQ\s*([1-4])\b/i) || text.match(/\b(first|second|third|fourth)\s+quarter/i);
  if (m && anchor) {
    const qn = /^[1-4]$/.test(m[1]) ? parseInt(m[1], 10) : ord[m[1].toLowerCase()];
    if (qn) return inferred(`${fyToken(anchor)}-Q${qn}`);
  }

  // P1: bare half without FY — "second half", "H2", "first half"
  m = text.match(/\bH\s*([12])\b/i);
  if (m && anchor) return inferred(`${fyToken(anchor)}-H${m[1]}`);
  if (/(first half|1h)\b/i.test(text) && anchor) return inferred(`${fyToken(anchor)}-H1`);
  if (/(second half|2h)\b/i.test(text) && anchor) return inferred(`${fyToken(anchor)}-H2`);

  // P1 fallback: timeframe text exists but is unrecognized — anchor to the
  // document's own period (lowest confidence; clearly flagged inferred).
  const docTok = docPeriodToken(statementPeriod);
  if (docTok) {
    return { target_period: docTok, canonical: docTok, horizon_inferred: true, confidence_p: 0.5 };
  }

  return { target_period: null, canonical: null, horizon_inferred: false, confidence_p: 0.3 };
}
