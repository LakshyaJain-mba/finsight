// Embedding generation + text chunking.
//
// Provider selection (first available wins):
//  1. GEMINI_API_KEY  -> Google gemini-embedding-001  (default; reuses the LLM key)
//  2. VOYAGE_API_KEY  -> Voyage voyage-finance-2       (finance-tuned alternative)
//  3. OPENAI_API_KEY  -> OpenAI text-embedding-3-small
// All providers are normalised to 1536 dimensions to match the pgvector column
// (document_chunks.embedding vector(1536)). No schema change is required.
import { fetchOrThrow, withRetry } from './retry';

const EMBED_DIMS = 1536;



// Retrieval quality improves when documents and queries are embedded with
// distinct task types (asymmetric retrieval). Mapped per provider below.
export type EmbeddingKind = 'document' | 'query';

interface ProviderListResponse {
  data: { embedding: number[] }[];
}

interface GeminiEmbeddingResponse {
  embedding?: { values: number[] };
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// L2-normalise so stored vectors are unit length. Google returns normalised
// vectors only for the default 3072 dims; for other sizes we normalise here.
// (Cosine ranking is unaffected, but unit vectors keep the store consistent.)
function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm > 0 ? v.map((x) => x / norm) : v;
}

async function embedWithGemini(
  text: string,
  apiKey: string,
  kind: EmbeddingKind
): Promise<number[]> {
  const taskType = kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
  const res = await withRetry(
    () =>
      fetchOrThrow(
        `${GEMINI_API_BASE}/models/gemini-embedding-001:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBED_DIMS,
          }),
        },
        'gemini-embedding'
      ),
    { label: 'gemini-embedding' }
  );
  const json = (await res.json()) as GeminiEmbeddingResponse;
  const values = json.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error('Gemini embedding returned no values');
  }
  return l2normalize(values);
}

async function embedWithVoyage(
  text: string,
  apiKey: string,
  kind: EmbeddingKind
): Promise<number[]> {
  const res = await withRetry(
    () =>
      fetchOrThrow(
        'https://api.voyageai.com/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: text,
            model: 'voyage-finance-2',
            input_type: kind, // 'document' | 'query'
            output_dimension: EMBED_DIMS,
          }),
        },
        'voyage-embedding'
      ),
    { label: 'voyage-embedding' }
  );
  const json = (await res.json()) as ProviderListResponse;
  return json.data[0].embedding;
}

async function embedWithOpenAI(text: string, apiKey: string): Promise<number[]> {
  const res = await withRetry(
    () =>
      fetchOrThrow(
        'https://api.openai.com/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: text,
            model: 'text-embedding-3-small',
            dimensions: EMBED_DIMS,
          }),
        },
        'openai-embedding'
      ),
    { label: 'openai-embedding' }
  );
  const json = (await res.json()) as ProviderListResponse;
  return json.data[0].embedding;
}

/**
 * Generate a 1536-dim embedding for a chunk (`document`) or a search string
 * (`query`). Provider is chosen from available env keys, Gemini first.
 */
export async function generateEmbedding(
  text: string,
  kind: EmbeddingKind = 'document'
): Promise<number[]> {
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!input) {
    throw new Error('Cannot embed empty text');
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return embedWithGemini(input, geminiKey, kind);
  }

  const voyageKey = process.env.VOYAGE_API_KEY;
  if (voyageKey) {
    return embedWithVoyage(input, voyageKey, kind);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return embedWithOpenAI(input, openaiKey);
  }

  throw new Error(
    'No embedding provider configured. Set GEMINI_API_KEY (default), VOYAGE_API_KEY, or OPENAI_API_KEY.'
  );
}

/**
 * Split text into overlapping windows on word boundaries.
 * Defaults: 1500 chars per chunk, 200 char overlap.
 */
export function chunkText(text: string, size = 1500, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (clean.length <= size) {
    return clean ? [clean] : [];
  }

  const chunks: string[] = [];
  const step = Math.max(1, size - overlap);
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    // Prefer breaking on whitespace to avoid splitting words mid-token.
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= clean.length) {
      break;
    }
    start += step;
  }

  return chunks;
}
