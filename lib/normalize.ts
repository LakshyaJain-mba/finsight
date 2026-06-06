// Guidance normalization (M1) — deterministic, provider-agnostic enrichment.
// Derives canonical metric_key, polarity, target_period, and parsed_value from
// an extracted guidance statement using the frozen Spec v1.0 modules.
import type { ExtractedGuidance, ParsedValue, Polarity } from '@/types';
import { canonicalizeMetric } from './taxonomy';
import { parseTimeframe } from './timeframe';
import { parseValue } from './value-parser';

export interface NormalizedGuidance {
  metric_key: string;
  polarity: Polarity | null;
  target_period: string | null;
  parsed_value: ParsedValue;
  // The value string to persist. Null when a hard unit mismatch makes the raw
  // value untrustworthy (Option B): we do not rewrite it, we suppress it and
  // flag the statement for review while preserving the statement text.
  value_given: string | null;
  needs_review: boolean;
}

export function normalizeGuidance(
  s: ExtractedGuidance,
  statementPeriod: string
): NormalizedGuidance {
  // Prefer a valid model-emitted metric_key; otherwise derive from text.
  const source = s.metric_key && s.metric_key !== 'OTHER' ? s.metric_key : s.metric ?? s.statement ?? '';
  const canon = canonicalizeMetric(source);
  const tf = parseTimeframe(s.timeframe ?? '', statementPeriod);
  const parsed = parseValue(s.value_given ?? null, canon.metric_key);

  // Option B: on a hard unit mismatch (e.g. EBITDA_MARGIN/NIM/PE with a
  // currency value), do NOT rewrite the number. Suppress value_given (null),
  // keep the statement text, and flag for review. parsed_value retains the
  // mismatch flag and reduced confidence from the parser.
  const hardMismatch = parsed.unit_mismatch === true;
  const value_given = hardMismatch ? null : s.value_given ?? null;

  return {
    metric_key: canon.metric_key,
    polarity: canon.polarity,
    target_period: tf.target_period,
    parsed_value: parsed,
    value_given,
    needs_review: hardMismatch,
  };
}
