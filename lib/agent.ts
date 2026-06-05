import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyIntent, synthesizeAnswer } from './claude';
import { generateEmbedding } from './embed';
import type { ChatMessage, Citation } from '@/types';

async function resolveCompanyId(
  supabase: SupabaseClient,
  ticker: string
): Promise<string | null> {
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

export async function routeQuery(
  query: string,
  companyTicker: string | null,
  supabase: SupabaseClient,
  history: ChatMessage[]
): Promise<{ answer: string; citations: Citation[] }> {
  // Step 1: Classify intent using Haiku (cheap)
  const intent = await classifyIntent(query);

  let context = '';
  let citations: Citation[] = [];

  const intentTicker = intent.company_ticker || companyTicker;

  // Step 2: Route to appropriate data source
  if (intent.type === 'guidance_lookup' && intentTicker) {
    // Hit structured DB — no vector search needed
    const companyId = await resolveCompanyId(supabase, intentTicker);
    if (companyId) {
      const { data } = await supabase
        .from('guidance_statements')
        .select('*, documents!left(period, title), guidance_outcomes!left(outcome, actual_value)')
        .eq('company_id', companyId)
        .limit(20);
      context = JSON.stringify(data ?? []);
      citations =
        data?.map((g: any) => ({
          document_id: g.document_id,
          period: g.documents?.period ?? g.period ?? '',
          excerpt: g.statement,
        })) ?? [];
    }
  } else if (intent.type === 'document_rag') {
    // Vector similarity search
    const ticker = intentTicker;
    if (ticker) {
      const embedding = await generateEmbedding(query, 'query');
      const { data } = await supabase.rpc('match_chunks', {
        query_embedding: embedding,
        ticker_filter: ticker.toUpperCase(),
        match_count: 5,
      });
      context = data?.map((c: any) => c.content).join('\n---\n') || '';
      citations =
        data?.map((c: any) => ({
          document_id: c.document_id,
          period: c.period ?? '',
          excerpt: c.content.slice(0, 150),
        })) || [];
    }
  } else if (intent.type === 'peer_comparison') {
    // Fetch management scores for comparison
    const { data } = await supabase
      .from('management_scores')
      .select('*, companies!left(ticker, name, sector)')
      .limit(10);
    context = JSON.stringify(data ?? []);
  } else {
    // General: use recent guidance as context
    const ticker = intentTicker;
    if (ticker) {
      const companyId = await resolveCompanyId(supabase, ticker);
      if (companyId) {
        const { data } = await supabase
          .from('guidance_statements')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(15);
        context = JSON.stringify(data ?? []);
      }
    }
  }

  // Step 3: Synthesize with Sonnet
  const answer = await synthesizeAnswer(query, context, history);
  return { answer, citations };
}
