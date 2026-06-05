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

  return {
    metric_key: canon.metric_key,
    polarity: canon.polarity,
    target_period: tf.target_period,
    parsed_value: parsed,
  };
}
