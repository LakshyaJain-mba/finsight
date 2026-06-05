// Outcome Resolution Rules — implementation of Spec v1.0 §2 & §4.4 (FROZEN).
// Pure comparison logic. Wired into ingest by the resolution engine (M3).
import type { Outcome, ParsedValue, Polarity } from '@/types';
import { toleranceFor, type Tolerance } from './taxonomy';

function mid(v: ParsedValue): number | null {
  if (v.low != null && v.high != null) return (v.low + v.high) / 2;
  if (v.low != null) return v.low;
  if (v.high != null) return v.high;
  return null;
}

/** Resolve a tolerance band (in the value's own unit) around a reference. */
function toleranceAmount(tol: Tolerance, reference: number): number {
  switch (tol.kind) {
    case 'bps':
      return tol.value; // already in percentage points
    case 'growth':
      return Math.min(tol.value, Math.abs(reference) * 0.1);
    case 'abs_rel':
    case 'days_rel':
      return Math.abs(reference) * tol.value;
    case 'mult':
      return tol.value;
    case 'plan_rel':
      return Math.abs(reference) * tol.value;
    default:
      return 0;
  }
}

/**
 * Compare a guidance value against a realized actual and produce an outcome.
 * Honors polarity (HIGHER_BETTER / LOWER_BETTER / TARGET_ATTAINMENT) and the
 * metric tolerance band.
 */
export function compare(
  guidance: ParsedValue,
  actual: ParsedValue,
  polarity: Polarity | null,
  metricKey: string
): Outcome {
  const actualVal = mid(actual);
  if (actualVal == null) return 'unresolved_no_data';

  const tol = toleranceFor(metricKey);

  // Directional guidance → sign test.
  if (guidance.type === 'directional') {
    const dir = guidance.direction;
    if (dir == null) return 'pending';
    // Need the actual's direction or sign of change; use actual.direction if present.
    const actualDir = actual.direction;
    if (actualDir == null) return 'pending';
    if (dir === 'flat') return actualDir === 'flat' ? 'met' : 'missed';
    return actualDir === dir ? 'met' : 'missed';
  }

  // Threshold guidance → boundary satisfaction (τ = 0).
  if (guidance.type === 'threshold') {
    if (guidance.low != null) {
      // "at least X": higher is satisfying
      if (actualVal >= guidance.low) {
        return actualVal >= guidance.low * 1.05 ? 'exceeded' : 'met';
      }
      return 'missed';
    }
    if (guidance.high != null) {
      // "below X": lower is satisfying
      if (actualVal <= guidance.high) {
        return actualVal <= guidance.high * 0.95 ? 'exceeded' : 'met';
      }
      return 'missed';
    }
    return 'pending';
  }

  // TARGET_ATTAINMENT → two-sided closeness to plan; never "exceeded".
  if (polarity === 'TARGET_ATTAINMENT') {
    const ref = mid(guidance);
    if (ref == null) return 'pending';
    const band = toleranceAmount(tol, ref);
    return Math.abs(actualVal - ref) <= band ? 'met' : 'missed';
  }

  // Quantitative point / range with directional polarity.
  const lower = guidance.low;
  const upper = guidance.high;
  if (lower == null && upper == null) return 'pending';

  const refLow = lower ?? upper!;
  const refHigh = upper ?? lower!;
  const band = toleranceAmount(tol, mid(guidance) ?? refLow);

  if (polarity === 'LOWER_BETTER') {
    if (actualVal <= refLow - band) return 'exceeded';
    if (actualVal <= refHigh + band) return 'met';
    return 'missed';
  }

  // Default HIGHER_BETTER
  if (actualVal >= refHigh + band) return 'exceeded';
  if (actualVal >= refLow - band) return 'met';
  return 'missed';
}

/** Human-readable variance string, e.g. "actual 12% vs guided 14–16%". */
export function describeVariance(guidance: ParsedValue, actual: ParsedValue): string {
  const g =
    guidance.low != null && guidance.high != null && guidance.low !== guidance.high
      ? `${guidance.low}–${guidance.high}`
      : `${guidance.low ?? guidance.high ?? '?'}`;
  const a = mid(actual);
  const unit = actual.unit ?? guidance.unit ?? '';
  return `actual ${a ?? '?'}${unit} vs guided ${g}${unit}`;
}
