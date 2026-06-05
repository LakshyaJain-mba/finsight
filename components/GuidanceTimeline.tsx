import { Badge } from '@/components/ui/badge';
import { CredibilityScore } from '@/components/CredibilityScore';
import { OutcomeEditor } from '@/components/OutcomeEditor';
import type {
  GuidanceStatementWithOutcome,
  ManagementScore,
  Outcome,
  OutcomeMethod,
} from '@/types';

interface GuidanceTimelineProps {
  statements: GuidanceStatementWithOutcome[];
  score?: ManagementScore | null;
  companyName?: string;
  editable?: boolean;
}

const OUTCOME_VARIANT: Record<
  Outcome,
  'green' | 'red' | 'indigo' | 'amber' | 'gray' | 'orange'
> = {
  met: 'green',
  missed: 'red',
  exceeded: 'indigo',
  revised: 'amber',
  pending: 'gray',
  in_progress: 'orange',
  unresolved_no_data: 'gray',
};

const METHOD_LABEL: Record<OutcomeMethod, string> = {
  manual: 'manual',
  ai_suggested: 'suggested',
  ai_auto: 'auto',
  analyst_confirmed: 'confirmed',
};

function getOutcome(s: GuidanceStatementWithOutcome) {
  const outcomes = s.guidance_outcomes ?? [];
  return outcomes.length > 0 ? outcomes[0] : null;
}

function groupByPeriod(statements: GuidanceStatementWithOutcome[]) {
  const groups = new Map<string, GuidanceStatementWithOutcome[]>();
  for (const s of statements) {
    const key = s.target_period ?? s.documents?.period ?? s.period ?? 'Unknown period';
    const bucket = groups.get(key) ?? [];
    bucket.push(s);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries());
}

export function GuidanceTimeline({
  statements,
  score,
  companyName,
  editable = false,
}: GuidanceTimelineProps) {
  const grouped = groupByPeriod(statements);

  return (
    <div className="space-y-6">
      {score !== undefined && (
        <CredibilityScore
          score={score}
          title={companyName ? `${companyName} — Management Credibility` : 'Management Credibility'}
        />
      )}

      {grouped.length === 0 ? (
        <p className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-500">
          No guidance statements recorded yet.
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map(([period, items]) => (
            <div key={period} className="relative">
              <div className="mb-3 flex items-center gap-3">
                <span className="rounded-md bg-indigo-500/15 px-3 py-1 text-sm font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                  {period}
                </span>
                <span className="text-xs text-gray-500">
                  {items.length} {items.length === 1 ? 'statement' : 'statements'}
                </span>
              </div>

              <ol className="space-y-3 border-l border-gray-800 pl-5">
                {items.map((s) => {
                  const outcome = getOutcome(s);
                  return (
                    <li key={s.id} className="relative">
                      <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-gray-900 bg-indigo-500" />
                      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {s.metric_key && s.metric_key !== 'OTHER' ? (
                              <span className="text-sm font-semibold text-gray-100">
                                {s.metric_key}
                              </span>
                            ) : (
                              s.metric && (
                                <span className="text-sm font-semibold text-gray-100">
                                  {s.metric}
                                </span>
                              )
                            )}
                            {s.timeframe && (
                              <span className="text-xs text-gray-500">· {s.timeframe}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={OUTCOME_VARIANT[outcome?.outcome ?? 'pending']}>
                              {outcome?.outcome ?? 'pending'}
                            </Badge>
                            {outcome?.method && outcome.method !== 'manual' && (
                              <Badge variant="gray">{METHOD_LABEL[outcome.method]}</Badge>
                            )}
                          </div>
                        </div>

                        <p className="text-sm text-gray-300">{s.statement}</p>

                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                          {s.value_given && (
                            <span>
                              <span className="text-gray-500">Promised: </span>
                              {s.value_given}
                            </span>
                          )}
                          {outcome?.actual_value && (
                            <span>
                              <span className="text-gray-500">Actual: </span>
                              {outcome.actual_value}
                            </span>
                          )}
                          {outcome?.variance && (
                            <span>
                              <span className="text-gray-500">Variance: </span>
                              {outcome.variance}
                            </span>
                          )}
                          {s.qualifier && (
                            <span>
                              <span className="text-gray-500">Qualifier: </span>
                              {s.qualifier}
                            </span>
                          )}
                        </div>

                        {editable && <OutcomeEditor guidanceId={s.id} current={outcome} />}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
