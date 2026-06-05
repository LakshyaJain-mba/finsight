// Confidence Scoring Framework — implementation of Spec v1.0 §5 (FROZEN).
// Constants below are the frozen configuration; changes require a spec bump.
import type {
  ConfidenceComponents,
  ConfidenceTier,
  DocType,
  GuidanceType,
} from '@/types';

// §5.2 component weights (sum = 1.0)
export const WEIGHTS = { m: 0.25, p: 0.2, v: 0.2, t: 0.15, a: 0.2 } as const;

// §5.4 tier thresholds
export const AUTO_CONFIRM_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.55;

// §5.6 provisional cutoff
export const PROVISIONAL_MIN = 5;

// §5.2 guidance-type gradeability (t)
export const TYPE_GRADEABILITY: Record<GuidanceType | 'range' | 'threshold', number> = {
  quantitative: 1.0,
  qualitative: 0.3,
  directional: 0.7,
  range: 0.95,
  threshold: 0.9,
};

// §5.1 source authority (a) for ACTUALS
export const ACTUALS_AUTHORITY: Partial<Record<DocType, number>> = {
  annual_report: 1.0,
  quarterly_results: 0.9,
  investor_presentation: 0.75,
  rating_report: 0.65,
  concall: 0.6,
  drhp: 0.6,
  filing: 0.7,
};

// §5.1 source authority (a) for GUIDANCE statements
export const GUIDANCE_AUTHORITY: Partial<Record<DocType, number>> = {
  concall: 0.9,
  investor_presentation: 0.85,
  annual_report: 0.75,
  drhp: 0.65,
  rating_report: 0.55,
  filing: 0.6,
  quarterly_results: 0.6,
};

export function actualsAuthority(docType: DocType): number {
  return ACTUALS_AUTHORITY[docType] ?? 0.6;
}

export function guidanceAuthority(docType: DocType): number {
  return GUIDANCE_AUTHORITY[docType] ?? 0.6;
}

/** §5.2 composite confidence. */
export function computeConfidence(c: ConfidenceComponents): number {
  const raw =
    WEIGHTS.m * c.m + WEIGHTS.p * c.p + WEIGHTS.v * c.v + WEIGHTS.t * c.t + WEIGHTS.a * c.a;
  return Math.max(0, Math.min(1, raw));
}

/** §5.3 corroboration: +0.10 on agreement (capped), −0.25 on conflict. */
export function applyCorroboration(
  base: number,
  opts: { agrees?: boolean; conflicts?: boolean; singleSoftSource?: boolean }
): number {
  let c = base;
  if (opts.agrees) c = Math.min(1, c + 0.1);
  if (opts.conflicts) c = c - 0.25;
  if (opts.singleSoftSource) c = Math.min(c, 0.8);
  return Math.max(0, Math.min(1, c));
}

/**
 * §5.4 tier gating.
 * T1 auto-confirm: C ≥ 0.85 AND authority ≥ 0.90 AND gradeable type AND no conflict.
 * T2 review: 0.55 ≤ C < 0.85, or directional, or conflict, or fuzzy.
 * T3 manual/pending: C < 0.55, qualitative, or unclassified.
 */
export function assignTier(opts: {
  confidence: number;
  guidanceType: GuidanceType | 'range' | 'threshold' | null;
  authority: number;
  hasConflict: boolean;
}): ConfidenceTier {
  const { confidence, guidanceType, authority, hasConflict } = opts;

  if (guidanceType === 'qualitative' || guidanceType == null) return 'T3';
  if (confidence < REVIEW_THRESHOLD) return 'T3';

  const gradeable =
    guidanceType === 'quantitative' || guidanceType === 'range' || guidanceType === 'threshold';

  if (
    confidence >= AUTO_CONFIRM_THRESHOLD &&
    authority >= 0.9 &&
    gradeable &&
    !hasConflict
  ) {
    return 'T1';
  }

  return 'T2';
}
