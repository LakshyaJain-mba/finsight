import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { extractTextFromPdf } from '@/lib/extract';
import { extractGuidance } from '@/lib/claude';
import { chunkText, generateEmbedding } from '@/lib/embed';
import { normalizeGuidance } from '@/lib/normalize';
import { detectRevision } from '@/lib/revision';
import { recomputeAndPersistScore } from '@/lib/scoring';
import type { DocType, ExtractedGuidance, ParsedValue, Polarity } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DOC_TYPES: DocType[] = [
  'concall',
  'annual_report',
  'drhp',
  'filing',
  'quarterly_results',
  'investor_presentation',
  'rating_report',
];

// Limit concurrent embedding calls to stay within provider rate limits.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// Detect and record revisions: when a newly ingested statement targets the same
// (metric_key, target_period) as a prior active statement, supersede the old one
// and log a revision event. Best-effort; failures never break ingestion.
async function applyRevisionDetection(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
  inserted: {
    id: string;
    metric_key: string | null;
    target_period: string | null;
    parsed_value: ParsedValue | null;
    polarity: Polarity | null;
  }[]
): Promise<void> {
  for (const stmt of inserted) {
    if (!stmt.metric_key || stmt.metric_key === 'OTHER' || !stmt.target_period) continue;
    try {
      const { data: priors } = await supabase
        .from('guidance_statements')
        .select('id, parsed_value')
        .eq('company_id', companyId)
        .eq('metric_key', stmt.metric_key)
        .eq('target_period', stmt.target_period)
        .eq('is_active', true)
        .neq('id', stmt.id)
        .order('created_at', { ascending: false });

      if (!priors || priors.length === 0) continue;

      const priorIds = priors.map((p: any) => p.id);
      await supabase
        .from('guidance_statements')
        .update({ is_active: false, superseded_by: stmt.id })
        .in('id', priorIds);

      const rev = detectRevision(
        (priors[0] as any).parsed_value ?? null,
        stmt.parsed_value,
        stmt.polarity
      );
      await supabase.from('revision_events').insert({
        original_id: priors[0].id,
        successor_id: stmt.id,
        direction: rev.direction,
        delta_description: rev.delta_description,
      });
    } catch {
      // Non-fatal: revision bookkeeping should never block ingestion.
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const companyId = String(form.get('company_id') ?? '').trim();
    const period = String(form.get('period') ?? '').trim();
    const docTypeRaw = String(form.get('doc_type') ?? '').trim();
    const title = String(form.get('title') ?? '').trim() || null;
    const pastedText = String(form.get('text') ?? '').trim();
    const file = form.get('file');

    if (!companyId) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
    }
    if (!period) {
      return NextResponse.json({ error: 'period is required' }, { status: 400 });
    }
    if (!DOC_TYPES.includes(docTypeRaw as DocType)) {
      return NextResponse.json(
        { error: `doc_type must be one of: ${DOC_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    const docType = docTypeRaw as DocType;

    // Resolve text from either an uploaded PDF or pasted text.
    let rawText = '';
    if (file && file instanceof File && file.size > 0) {
      if (file.type && !file.type.includes('pdf')) {
        return NextResponse.json(
          { error: 'Only PDF files are supported for upload' },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      rawText = await extractTextFromPdf(buffer);
    } else if (pastedText) {
      rawText = pastedText;
    } else {
      return NextResponse.json(
        { error: 'Provide either a PDF file or raw text' },
        { status: 400 }
      );
    }

    if (rawText.length < 50) {
      return NextResponse.json(
        { error: 'Extracted text is too short to process' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();

    // Confirm company exists (also gives us a clean FK error early).
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single();
    if (companyErr || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // 1. Insert the document record.
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        company_id: companyId,
        doc_type: docType,
        period,
        title: title ?? `${company.name} ${period} ${docType}`,
        raw_text: rawText,
        processed: false,
      })
      .select()
      .single();
    if (docErr || !doc) {
      return NextResponse.json(
        { error: docErr?.message ?? 'Failed to create document' },
        { status: 500 }
      );
    }

    // 2. Extract guidance from the leading portion of the transcript.
    const extraction = await extractGuidance(rawText, period, company.name);
    const statements: ExtractedGuidance[] = Array.isArray(extraction.statements)
      ? extraction.statements
      : [];

    // 3. Persist guidance statements (with a pending outcome each), enriched with
    //    Spec v1.0 normalization (metric_key, polarity, target_period, parsed_value).
    if (statements.length > 0) {
      const rows = statements.map((s) => {
        const norm = normalizeGuidance(s, period);
        return {
          document_id: doc.id,
          company_id: companyId,
          speaker: s.speaker ?? null,
          metric: s.metric ?? null,
          statement: (s.statement ?? '').slice(0, 200),
          guidance_type: s.guidance_type ?? null,
          value_given: s.value_given ?? null,
          timeframe: s.timeframe ?? null,
          qualifier: s.qualifier ?? null,
          confidence_signal: s.confidence_signal ?? null,
          period,
          metric_key: norm.metric_key,
          polarity: norm.polarity,
          target_period: norm.target_period,
          parsed_value: norm.parsed_value,
          is_active: true,
        };
      });
      const { data: insertedGuidance, error: gErr } = await supabase
        .from('guidance_statements')
        .insert(rows)
        .select('id, metric_key, target_period, parsed_value, polarity');
      if (gErr) {
        return NextResponse.json({ error: gErr.message }, { status: 500 });
      }
      if (insertedGuidance && insertedGuidance.length > 0) {
        await supabase.from('guidance_outcomes').insert(
          insertedGuidance.map((g) => ({
            guidance_id: g.id,
            outcome: 'pending' as const,
            method: 'manual' as const,
          }))
        );
        // Supersede any prior active guidance on the same metric+period.
        await applyRevisionDetection(
          supabase,
          companyId,
          insertedGuidance as {
            id: string;
            metric_key: string | null;
            target_period: string | null;
            parsed_value: ParsedValue | null;
            polarity: Polarity | null;
          }[]
        );
      }
    }

    // 4. Chunk, embed, and store chunks for RAG. Best-effort: if no embedding
    //    provider is configured we still keep the document + guidance.
    const chunks = chunkText(rawText, 1500, 200);
    let chunksStored = 0;
    let embeddingWarning: string | null = null;

    try {
      const embeddings = await mapWithConcurrency(chunks, 5, (chunk) =>
        generateEmbedding(chunk)
      );
      if (chunks.length > 0) {
        const { error: chunkErr } = await supabase.from('document_chunks').insert(
          chunks.map((content, i) => ({
            document_id: doc.id,
            chunk_index: i,
            content,
            embedding: embeddings[i],
            metadata: { period, doc_type: docType },
          }))
        );
        if (chunkErr) {
          embeddingWarning = `Chunks not stored: ${chunkErr.message}`;
        } else {
          chunksStored = chunks.length;
        }
      }
    } catch (e) {
      embeddingWarning =
        e instanceof Error ? e.message : 'Embedding generation failed; RAG disabled for this doc';
    }

    // 5. Mark processed and recompute the management credibility score.
    await supabase.from('documents').update({ processed: true }).eq('id', doc.id);
    await recomputeAndPersistScore(supabase, companyId);

    return NextResponse.json({
      document_id: doc.id,
      statements_count: statements.length,
      chunks_stored: chunksStored,
      statements,
      summary: extraction.summary,
      management_tone: extraction.management_tone,
      key_themes: extraction.key_themes,
      ...(embeddingWarning ? { warning: embeddingWarning } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
