// Management credibility scoring.
// Pure computation (computeManagementScore) + a DB-aware recompute helper.
// Only AI-auto and analyst-confirmed outcomes count toward credibility; the
// score is PROVISIONAL until PROVISIONAL_MIN resolved outcomes exist.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConfidenceSignal,
  Outcome,
  OutcomeMethod,
  ScoreResult,
} from '@/types';
import { PROVISIONAL_MIN } from './confidence';

export interface ScoringRow {
  confidence_signal: ConfidenceSignal | null;
  period: string | null;
  is_active: boolean | null;
  outcome: Outcome | null;
  method: OutcomeMethod | null;
}

const COUNTING_METHODS: OutcomeMethod[] = ['ai_auto', 'analyst_confirmed'];
const RESOLVED_OUTCOMES: Outcome[] = ['met', 'missed', 'exceeded', 'revised'];

/** Pure credibility computation from guidance rows + their outcomes. */
export function computeManagementScore(rows: ScoringRow[]): ScoreResult {
  const active = rows.filter((r) => r.is_active !== false);
  const total = active.length;

  const hedged = active.filter(
    (r) => r.confidence_signal === 'hedged' || r.confidence_signal === 'vague'
  ).length;
  const hedgeRatio = total > 0 ? (hedged / total) * 100 : 0;

  // Only count outcomes that are both resolved AND from a trusted method.
  const counted = active.filter(
    (r) =>
      r.outcome != null &&
      RESOLVED_OUTCOMES.includes(r.outcome) &&
      r.method != null &&
      COUNTING_METHODS.includes(r.method)
  );
  const resolvedCount = counted.length;
  const hits = counted.filter((r) => r.outcome === 'met' || r.outcome === 'exceeded').length;
  const hitRate = resolvedCount > 0 ? (hits / resolvedCount) * 100 : 0;
  const revisionCount = counted.filter((r) => r.outcome === 'revised').length;

  const periods = new Set(active.map((r) => r.period).filter(Boolean));
  const periodsAnalyzed = periods.size;

  // Composite credibility: reward delivery, penalise hedging and revisions.
  // With no counted outcomes yet, lean on hedge ratio alone.
  const base =
    resolvedCount > 0 ? 0.7 * hitRate + 0.3 * (100 - hedgeRatio) : 100 - hedgeRatio;
  const score = Math.max(0, Math.min(100, base - revisionCount * 2));

  return {
    score: Number(score.toFixed(2)),
    guidance_hit_rate: Number(hitRate.toFixed(2)),
    hedge_ratio: Number(hedgeRatio.toFixed(2)),
    revision_count: revisionCount,
    periods_analyzed: periodsAnalyzed,
    resolved_count: resolvedCount,
    total_count: total,
    status: resolvedCount >= PROVISIONAL_MIN ? 'rated' : 'provisional',
  };
}

/**
 * Fetch a company's guidance + outcomes, recompute the credibility score, and
 * upsert management_scores. Returns the computed result.
 */
export async function recomputeAndPersistScore(
  supabase: SupabaseClient,
  companyId: string
): Promise<ScoreResult> {
  const { data } = await supabase
    .from('guidance_statements')
    .select('confidence_signal, period, is_active, guidance_outcomes!left(outcome, method)')
    .eq('company_id', companyId);

  const rows: ScoringRow[] = (data ?? []).map((r: any) => {
    const o = Array.isArray(r.guidance_outcomes) ? r.guidance_outcomes[0] : null;
    return {
      confidence_signal: r.confidence_signal ?? null,
      period: r.period ?? null,
      is_active: r.is_active ?? null,
      outcome: o?.outcome ?? null,
      method: o?.method ?? null,
    };
  });

  const result = computeManagementScore(rows);

  await supabase.from('management_scores').upsert(
    {
      company_id: companyId,
      score: result.score,
      guidance_hit_rate: result.guidance_hit_rate,
      hedge_ratio: result.hedge_ratio,
      revision_count: result.revision_count,
      periods_analyzed: result.periods_analyzed,
      resolved_count: result.resolved_count,
      total_count: result.total_count,
      status: result.status,
      last_updated: new Date().toISOString(),
    },
    { onConflict: 'company_id' }
  );

  return result;
}
