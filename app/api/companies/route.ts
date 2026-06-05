import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import type { CompanyWithScore } from '@/types';

export const runtime = 'nodejs';

// GET: list all companies with management_scores joined
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .select('*, management_scores(*)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ companies: (data ?? []) as CompanyWithScore[] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

// POST: create new company
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!ticker || !name) {
      return NextResponse.json(
        { error: 'ticker and name are required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .insert({
        ticker,
        name,
        sector: typeof body.sector === 'string' ? body.sector.trim() : null,
        exchange: typeof body.exchange === 'string' ? body.exchange.trim() : 'NSE',
      })
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation (ticker already exists)
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ company: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
