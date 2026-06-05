import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { recomputeAndPersistScore } from '@/lib/scoring';
import type { GuidanceStatementWithOutcome, Outcome, ReviewQueueItem } from '@/types';

export const runtime = 'nodejs';

const OUTCOMES: Outcome[] = [
  'met',
  'missed',
  'exceeded',
  'revised',
  'pending',
  'in_progress',
  'unresolved_no_data',
];

// GET:
//  - ?company_id=...            → statements for a company with outcomes joined
//  - ?status=pending[&company_id] → review queue of statements awaiting an outcome
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const companyId = req.nextUrl.searchParams.get('company_id');
    const status = req.nextUrl.searchParams.get('status');

    if (status === 'pending') {
      let query = supabase
        .from('guidance_statements')
        .select(
          '*, companies!left(ticker, name), documents!left(period, title), guidance_outcomes!left(outcome, method)'
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(300);
      if (companyId) query = query.eq('company_id', companyId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

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

      return NextResponse.json({ items });
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id (or status=pending) is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('guidance_statements')
      .select('*, documents!left(period, title), guidance_outcomes!left(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      statements: (data ?? []) as unknown as GuidanceStatementWithOutcome[],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

// PATCH: analyst sets/overrides an outcome. Marks method=analyst_confirmed,
// recomputes the company credibility score, and returns the updated score.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const guidanceId = typeof body.guidance_id === 'string' ? body.guidance_id : '';
    const outcome = body.outcome as Outcome;

    if (!guidanceId) {
      return NextResponse.json({ error: 'guidance_id is required' }, { status: 400 });
    }
    if (!OUTCOMES.includes(outcome)) {
      return NextResponse.json(
        { error: `outcome must be one of: ${OUTCOMES.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Resolve the owning company (needed for score recompute).
    const { data: stmt, error: stmtErr } = await supabase
      .from('guidance_statements')
      .select('company_id')
      .eq('id', guidanceId)
      .maybeSingle();
    if (stmtErr || !stmt) {
      return NextResponse.json({ error: 'Guidance statement not found' }, { status: 404 });
    }

    const isResolved = outcome !== 'pending';
    const update: Record<string, unknown> = {
      outcome,
      // Analyst action is authoritative (Spec v1.0 §5.5).
      method: 'analyst_confirmed',
      updated_at: new Date().toISOString(),
      resolved_at: isResolved ? new Date().toISOString() : null,
    };
    if (typeof body.actual_value === 'string') update.actual_value = body.actual_value;
    if (typeof body.notes === 'string') update.notes = body.notes;
    if (typeof body.evidence_doc_id === 'string') update.evidence_doc_id = body.evidence_doc_id;

    // Upsert the outcome row keyed on guidance_id (one outcome per statement).
    const { data: existing } = await supabase
      .from('guidance_outcomes')
      .select('id')
      .eq('guidance_id', guidanceId)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from('guidance_outcomes')
        .update(update)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('guidance_outcomes')
        .insert({ guidance_id: guidanceId, ...update })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const score = await recomputeAndPersistScore(supabase, stmt.company_id as string);

    return NextResponse.json({ outcome: result.data, score });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
