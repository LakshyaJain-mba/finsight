import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { routeQuery } from '@/lib/agent';
import type { ChatMessage } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Sentinel separating streamed answer text from the trailing citations JSON.
// Kept in sync with components/ChatInterface.tsx.
const CITATIONS_MARKER = '\n__FINSIGHT_CITATIONS__\n';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const companyTicker =
      typeof body.company_ticker === 'string' && body.company_ticker
        ? body.company_ticker
        : null;
    const history: ChatMessage[] = Array.isArray(body.history) ? body.history.slice(-10) : [];

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { answer, citations } = await routeQuery(query, companyTicker, supabase, history);

    // Stream the answer progressively, then emit citations after the sentinel.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const words = answer.split(/(\s+)/);
        for (const word of words) {
          controller.enqueue(encoder.encode(word));
          // Yield to the event loop so chunks flush incrementally.
          await new Promise((r) => setTimeout(r, 5));
        }
        controller.enqueue(encoder.encode(CITATIONS_MARKER + JSON.stringify(citations)));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
