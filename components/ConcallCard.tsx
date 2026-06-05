import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type {
  ConfidenceSignal,
  ExtractedGuidance,
  RawExtractionResult,
} from '@/types';

interface ConcallCardProps {
  result: RawExtractionResult;
  meta: { companyName: string; period: string; docType?: string };
}

const CONFIDENCE_VARIANT: Record<ConfidenceSignal, 'indigo' | 'amber' | 'orange' | 'red'> = {
  high: 'indigo',
  medium: 'amber',
  hedged: 'orange',
  vague: 'red',
};

const TONE_VARIANT: Record<
  RawExtractionResult['management_tone'],
  'green' | 'amber' | 'orange' | 'red'
> = {
  confident: 'green',
  cautious: 'amber',
  defensive: 'orange',
  evasive: 'red',
};

export function ConcallCard({ result, meta }: ConcallCardProps) {
  const statements: ExtractedGuidance[] = result.statements ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-100">{meta.companyName}</h3>
            <p className="text-sm text-gray-500">
              {meta.period}
              {meta.docType ? ` · ${meta.docType}` : ''}
            </p>
          </div>
          <Badge variant={TONE_VARIANT[result.management_tone]}>
            Tone: {result.management_tone}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Guidance table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2">Metric</th>
                <th className="px-2 py-2">Value</th>
                <th className="px-2 py-2">Timeframe</th>
                <th className="px-2 py-2">Qualifier</th>
                <th className="px-2 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {statements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                    No forward-looking statements detected.
                  </td>
                </tr>
              ) : (
                statements.map((s, i) => (
                  <tr key={i} className="border-b border-gray-800/60 align-top">
                    <td className="px-2 py-2 font-medium text-gray-200">{s.metric ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-300">{s.value_given ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-300">{s.timeframe ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-300">{s.qualifier ?? '—'}</td>
                    <td className="px-2 py-2">
                      {s.confidence_signal ? (
                        <Badge variant={CONFIDENCE_VARIANT[s.confidence_signal]}>
                          {s.confidence_signal}
                        </Badge>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary columns */}
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryColumn title="Positive" items={result.summary?.positive} accent="text-emerald-400" />
          <SummaryColumn title="Negative" items={result.summary?.negative} accent="text-red-400" />
          <SummaryColumn title="Neutral" items={result.summary?.neutral} accent="text-gray-400" />
        </div>

        {/* Key themes */}
        {result.key_themes?.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Key Themes</p>
            <div className="flex flex-wrap gap-2">
              {result.key_themes.map((theme, i) => (
                <Badge key={i} variant="gray">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryColumn({
  title,
  items,
  accent,
}: {
  title: string;
  items?: string[];
  accent: string;
}) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950 p-3">
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${accent}`}>{title}</p>
      {items && items.length > 0 ? (
        <ul className="space-y-1.5 text-sm text-gray-300">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-gray-600">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">None</p>
      )}
    </div>
  );
}
