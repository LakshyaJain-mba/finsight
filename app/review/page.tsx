import { createServiceClient } from '@/lib/supabase';
import { ReviewQueue } from '@/components/ReviewQueue';
import type { ReviewQueueItem } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Review Queue — FinSight',
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: { ticker?: string };
}) {
  const supabase = createServiceClient();

  let companyId: string | null = null;
  if (searchParams.ticker) {
    const { data } = await supabase
      .from('companies')
      .select('id')
      .eq('ticker', searchParams.ticker.toUpperCase())
      .maybeSingle();
    companyId = data?.id ?? null;
  }

  let query = supabase
    .from('guidance_statements')
    .select(
      '*, companies!left(ticker, name), documents!left(period, title), guidance_outcomes!left(outcome, method)'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(300);
  if (companyId) query = query.eq('company_id', companyId);

  const { data } = await query;

  const items: ReviewQueueItem[] = (data ?? [])
    .filter((r: any) => {
      const o = Array.isArray(r.guidance_outcomes) ? r.guidance_outcomes[0] : null;
      return !o || o.outcome === 'pending';
    })
    .map((r: any) => ({
      id: r.id,
      company_id: r.company_id,
      ticker: r.companies?.ticker ?? '',
      company_name: r.companies?.name ?? '',
      metric: r.metric ?? null,
      metric_key: r.metric_key ?? null,
      statement: r.statement,
      value_given: r.value_given ?? null,
      timeframe: r.timeframe ?? null,
      target_period: r.target_period ?? null,
      period: r.documents?.period ?? r.period ?? null,
      outcome: 'pending',
    }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Review Queue</h1>
        <p className="text-sm text-gray-500">
          Record what actually happened for each forward-looking statement. Confirmed
          outcomes feed the management credibility score.
          {searchParams.ticker ? ` Filtered to ${searchParams.ticker.toUpperCase()}.` : ''}
        </p>
      </div>
      <ReviewQueue items={items} />
    </div>
  );
}
