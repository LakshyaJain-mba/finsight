// Embedding generation + text chunking.
//
// Provider selection:
//  - If VOYAGE_API_KEY is set, use Voyage AI voyage-finance-2 (finance-tuned).
//  - Otherwise fall back to OpenAI text-embedding-3-small.
// Both are normalised to 1536 dimensions to match the pgvector column.

const EMBED_DIMS = 1536;

interface OpenAIEmbeddingResponse {
  data: { embedding: number[] }[];
}

interface VoyageEmbeddingResponse {
  data: { embedding: number[] }[];
}

async function embedWithVoyage(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'voyage-finance-2',
      output_dimension: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embedding failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as VoyageEmbeddingResponse;
  return json.data[0].embedding;
}

async function embedWithOpenAI(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
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
  });
  if (!res.ok) {
    throw new Error(`OpenAI embedding failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as OpenAIEmbeddingResponse;
  return json.data[0].embedding;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!input) {
    throw new Error('Cannot embed empty text');
  }

  const voyageKey = process.env.VOYAGE_API_KEY;
  if (voyageKey) {
    return embedWithVoyage(input, voyageKey);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return embedWithOpenAI(input, openaiKey);
  }

  throw new Error(
    'No embedding provider configured. Set VOYAGE_API_KEY or OPENAI_API_KEY.'
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
