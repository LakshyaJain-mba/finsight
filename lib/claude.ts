// LLM wrapper — Google Gemini 2.5 Flash via the Generative Language REST API.
//
// This module is the single provider abstraction. Exported function signatures
// (extractGuidance / classifyIntent / synthesizeAnswer) and their return types
// are unchanged, so no caller (agent.ts, process-document route) needs edits.
// Prompts (lib/prompts.ts) and JSON schemas are preserved exactly.
import {
  EXTRACTION_SYSTEM_PROMPT,
  INTENT_CLASSIFICATION_PROMPT,
  SYNTHESIS_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildRAGPrompt,
} from './prompts';
import type { AgentIntent, ChatMessage, RawExtractionResult } from '@/types';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Model identifiers. `fast`/`standard` both map to Gemini 2.5 Flash (the
// migration target); `powerful` is provided for parity with the prior map.
export const MODELS = {
  fast: 'gemini-2.5-flash',
  standard: 'gemini-2.5-flash',
  powerful: 'gemini-2.5-pro',
} as const;

// Lazily resolve the key so importing this module never requires it at build time.
function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Missing environment variable: GEMINI_API_KEY');
  }
  return key;
}

// Models occasionally wrap JSON in markdown fences or add stray whitespace.
// Strip fences and isolate the outermost JSON object before parsing.
// (Retained as the fallback even when structured JSON mode is requested.)
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

interface GeminiPart {
  text?: string;
}
interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

interface GenerateOptions {
  model: string;
  system: string;
  contents: GeminiContent[];
  maxOutputTokens: number;
  json: boolean;
}

async function generate(opts: GenerateOptions): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: opts.maxOutputTokens,
      // Disable "thinking" so the full token budget goes to the answer and
      // structured JSON is never truncated by reasoning tokens.
      thinkingConfig: { thinkingBudget: 0 },
      // Structured JSON mode for extraction/intent.
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${opts.model}:generateContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}

export async function extractGuidance(
  text: string,
  period: string,
  company: string
): Promise<RawExtractionResult> {
  // Use Flash for extraction — structured task, cost-sensitive.
  const raw = await generate({
    model: MODELS.fast,
    system: EXTRACTION_SYSTEM_PROMPT,
    contents: [
      { role: 'user', parts: [{ text: buildExtractionUserPrompt(text, period, company) }] },
    ],
    maxOutputTokens: 2000,
    json: true,
  });
  return parseJson<RawExtractionResult>(raw);
}

export async function classifyIntent(query: string): Promise<AgentIntent> {
  const raw = await generate({
    model: MODELS.fast,
    system: INTENT_CLASSIFICATION_PROMPT,
    contents: [{ role: 'user', parts: [{ text: query }] }],
    maxOutputTokens: 150,
    json: true,
  });
  return parseJson<AgentIntent>(raw || '{}');
}

export async function synthesizeAnswer(
  query: string,
  context: string,
  history: ChatMessage[]
): Promise<string> {
  const contents: GeminiContent[] = [
    ...history.map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: buildRAGPrompt(query, [], context) }] },
  ];
  return generate({
    model: MODELS.standard,
    system: SYNTHESIS_SYSTEM_PROMPT,
    contents,
    maxOutputTokens: 600,
    json: false,
  });
}
