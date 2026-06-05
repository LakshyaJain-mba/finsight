import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ManagementScore } from '@/types';

interface CredibilityScoreProps {
  score: ManagementScore | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

function scoreColor(value: number): { stroke: string; text: string } {
  if (value > 70) return { stroke: 'stroke-emerald-500', text: 'text-emerald-400' };
  if (value >= 40) return { stroke: 'stroke-amber-500', text: 'text-amber-400' };
  return { stroke: 'stroke-red-500', text: 'text-red-400' };
}

export function CredibilityScore({
  score,
  title,
  subtitle,
  compact = false,
}: CredibilityScoreProps) {
  const value = Number(score?.score ?? 0);
  const hitRate = Number(score?.guidance_hit_rate ?? 0);
  const hedgeRatio = Number(score?.hedge_ratio ?? 0);
  const revisions = Number(score?.revision_count ?? 0);
  const periods = Number(score?.periods_analyzed ?? 0);
  const resolved = Number(score?.resolved_count ?? 0);
  const totalCount = Number(score?.total_count ?? 0);
  const status = score?.status ?? 'provisional';

  const colors = scoreColor(value);

  const radius = compact ? 36 : 52;
  const stroke = compact ? 6 : 8;
  const size = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-5">
      {(title || subtitle) && (
        <div className="text-center">
          {title && <p className="font-semibold text-gray-100">{title}</p>}
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            className="fill-none stroke-gray-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn('fill-none transition-all duration-700', colors.stroke)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-bold', colors.text)}>{value.toFixed(0)}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Credibility</span>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-2 text-center">
        <Metric label="Hit Rate" value={`${hitRate.toFixed(0)}%`} />
        <Metric label="Hedge" value={`${hedgeRatio.toFixed(0)}%`} />
        <Metric label="Revisions" value={`${revisions}`} />
      </div>

      {!compact && (
        <div className="flex flex-col items-center gap-1.5">
          <Badge variant={status === 'rated' ? 'green' : 'amber'}>
            {status === 'rated' ? 'Rated' : 'Provisional'}
          </Badge>
          <p className="text-xs text-gray-500">
            {resolved} of {totalCount} resolved · {periods}{' '}
            {periods === 1 ? 'period' : 'periods'} analyzed
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-950 px-2 py-2">
      <p className="text-sm font-semibold text-gray-100">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}
