import Anthropic from '@anthropic-ai/sdk';
import {
  EXTRACTION_SYSTEM_PROMPT,
  INTENT_CLASSIFICATION_PROMPT,
  SYNTHESIS_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildRAGPrompt,
} from './prompts';
import type { AgentIntent, ChatMessage, RawExtractionResult } from '@/types';

// Lazily instantiate so importing this module never requires the API key at
// build time. The key is resolved on first use inside a request.
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing environment variable: ANTHROPIC_API_KEY');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const MODELS = {
  fast: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-5',
  powerful: 'claude-opus-4-5',
} as const;

// Models occasionally wrap JSON in markdown fences or add stray whitespace.
// Strip fences and isolate the outermost JSON object before parsing.
function parseJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text) as T;
}

export async function extractGuidance(
  text: string,
  period: string,
  company: string
): Promise<RawExtractionResult> {
  // Use Haiku for extraction — structured task, cost-sensitive
  const response = await client().messages.create({
    model: MODELS.fast,
    max_tokens: 2000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildExtractionUserPrompt(text, period, company) }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJson<RawExtractionResult>(raw);
}

export async function classifyIntent(query: string): Promise<AgentIntent> {
  const response = await client().messages.create({
    model: MODELS.fast,
    max_tokens: 150,
    system: INTENT_CLASSIFICATION_PROMPT,
    messages: [{ role: 'user', content: query }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return parseJson<AgentIntent>(raw);
}

export async function synthesizeAnswer(
  query: string,
  context: string,
  history: ChatMessage[]
): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: buildRAGPrompt(query, [], context) },
  ];
  const response = await client().messages.create({
    model: MODELS.standard,
    max_tokens: 600,
    system: SYNTHESIS_SYSTEM_PROMPT,
    messages,
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
