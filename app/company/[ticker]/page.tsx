import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageSquare, ClipboardCheck } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import { GuidanceTimeline } from '@/components/GuidanceTimeline';
import type {
  Company,
  GuidanceStatementWithOutcome,
  ManagementScore,
} from '@/types';

export const dynamic = 'force-dynamic';

export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('ticker', ticker)
    .maybeSingle();

  if (!company) {
    notFound();
  }

  const typedCompany = company as Company;

  const [{ data: statements }, { data: score }] = await Promise.all([
    supabase
      .from('guidance_statements')
      .select('*, documents!left(period, title), guidance_outcomes!left(*)')
      .eq('company_id', typedCompany.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('management_scores')
      .select('*')
      .eq('company_id', typedCompany.id)
      .maybeSingle(),
  ]);

  const typedStatements = (statements ?? []) as unknown as GuidanceStatementWithOutcome[];
  const typedScore = (score ?? null) as ManagementScore | null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{typedCompany.name}</h1>
          <p className="text-sm text-gray-500">
            {typedCompany.ticker}
            {typedCompany.sector ? ` · ${typedCompany.sector}` : ''} · {typedCompany.exchange}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/review?ticker=${encodeURIComponent(typedCompany.ticker)}`}
            className="inline-flex items-center gap-2 rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-800"
          >
            <ClipboardCheck className="h-4 w-4" /> Review outcomes
          </Link>
          <Link
            href={`/chat?ticker=${encodeURIComponent(typedCompany.ticker)}`}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <MessageSquare className="h-4 w-4" /> Chat about this company
          </Link>
        </div>
      </div>

      <GuidanceTimeline
        statements={typedStatements}
        score={typedScore}
        companyName={typedCompany.name}
        editable
      />
    </div>
  );
}
