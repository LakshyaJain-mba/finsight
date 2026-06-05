import Link from 'next/link';
import { FileText, ClipboardCheck } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase';
import { CredibilityScore } from '@/components/CredibilityScore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Company, ManagementScore } from '@/types';

export const dynamic = 'force-dynamic';

interface CompanyRow extends Company {
  management_scores: ManagementScore[] | ManagementScore | null;
}

interface RecentDoc {
  id: string;
  title: string | null;
  period: string | null;
  doc_type: string | null;
  created_at: string;
  companies: { ticker: string; name: string } | null;
}

function firstScore(s: CompanyRow['management_scores']): ManagementScore | null {
  if (!s) return null;
  return Array.isArray(s) ? s[0] ?? null : s;
}

export default async function DashboardPage() {
  const supabase = createServiceClient();

  const [{ data: companies }, { data: docs }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('companies')
      .select('*, management_scores(*)')
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('id, title, period, doc_type, created_at, companies(ticker, name)')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('guidance_outcomes')
      .select('id', { count: 'exact', head: true })
      .eq('outcome', 'pending'),
  ]);

  const companyRows = (companies ?? []) as CompanyRow[];
  const recentDocs = (docs ?? []) as unknown as RecentDoc[];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main: guidance tracker grid */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Guidance Tracker</h1>
            <p className="text-sm text-gray-500">
              Management credibility across {companyRows.length}{' '}
              {companyRows.length === 1 ? 'company' : 'companies'}
            </p>
          </div>
          {(pendingCount ?? 0) > 0 && (
            <Link
              href="/review"
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
            >
              <ClipboardCheck className="h-4 w-4" />
              {pendingCount} awaiting outcome
            </Link>
          )}
        </div>

        {companyRows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-400">No companies yet.</p>
              <Link
                href="/upload"
                className="mt-3 inline-block text-sm font-medium text-indigo-400 hover:text-indigo-300"
              >
                Upload your first transcript →
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {companyRows.map((c) => (
              <Link key={c.id} href={`/company/${encodeURIComponent(c.ticker)}`}>
                <div className="transition-transform hover:-translate-y-0.5">
                  <CredibilityScore
                    score={firstScore(c.management_scores)}
                    title={c.name}
                    subtitle={`${c.ticker}${c.sector ? ` · ${c.sector}` : ''}`}
                    compact
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Sidebar: recent documents */}
      <aside>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Processed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentDocs.length === 0 ? (
              <p className="text-sm text-gray-500">No documents processed yet.</p>
            ) : (
              recentDocs.map((d) => (
                <div key={d.id} className="flex items-start gap-3 rounded-md bg-gray-950 p-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-200">
                      {d.companies?.ticker ?? '—'} · {d.period ?? '—'}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {d.doc_type} · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
