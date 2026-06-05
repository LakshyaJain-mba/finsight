// Revision detection — Spec v1.0 §3 / §4.5 (FROZEN).
// Determines whether a re-issued guidance is an upgrade, downgrade, or reaffirmation.
import type { ParsedValue, Polarity, RevisionDirection } from '@/types';

function mid(v: ParsedValue | null): number | null {
  if (!v) return null;
  if (v.low != null && v.high != null) return (v.low + v.high) / 2;
  if (v.low != null) return v.low;
  if (v.high != null) return v.high;
  return null;
}

export interface RevisionResult {
  direction: RevisionDirection;
  delta_description: string;
}

/**
 * Compare a prior guidance value with the current one, honoring polarity.
 * Falls back to directional hints when numeric midpoints are unavailable.
 */
export function detectRevision(
  prior: ParsedValue | null,
  current: ParsedValue | null,
  polarity: Polarity | null
): RevisionResult {
  const a = mid(prior);
  const b = mid(current);

  if (a != null && b != null) {
    if (a === b) return { direction: 'REAFFIRMED', delta_description: `Reaffirmed at ${b}` };
    const improved = polarity === 'LOWER_BETTER' ? b < a : b > a;
    const dir: RevisionDirection = improved ? 'UPGRADE' : 'DOWNGRADE';
    return { direction: dir, delta_description: `${dir.toLowerCase()} from ${a} to ${b}` };
  }

  // Directional fallback.
  const dirA = prior?.direction ?? null;
  const dirB = current?.direction ?? null;
  if (dirA && dirB) {
    if (dirA === dirB) return { direction: 'REAFFIRMED', delta_description: `Reaffirmed (${dirB})` };
    const improved =
      polarity === 'LOWER_BETTER' ? dirB === 'down' : dirB === 'up';
    const dir: RevisionDirection = improved ? 'UPGRADE' : 'DOWNGRADE';
    return { direction: dir, delta_description: `${dir.toLowerCase()} (${dirA} → ${dirB})` };
  }

  return { direction: 'REAFFIRMED', delta_description: 'Re-stated (no comparable value)' };
}
