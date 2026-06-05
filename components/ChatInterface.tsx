'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, ChevronDown, ChevronRight, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ChatMessage, Citation, Company } from '@/types';

// Must match CITATIONS_MARKER in app/api/chat/route.ts
const CITATIONS_MARKER = '\n__FINSIGHT_CITATIONS__\n';

interface ChatInterfaceProps {
  initialTicker?: string;
}

export function ChatInterface({ initialTicker }: ChatInterfaceProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ticker, setTicker] = useState(initialTicker ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((j) => setCompanies(j.companies ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const query = input.trim();
    if (!query || loading) return;

    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: query },
      { role: 'assistant', content: '' },
    ];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, company_ticker: ticker || null, history }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Chat request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const markerIdx = buffer.indexOf(CITATIONS_MARKER);
        const answer = markerIdx === -1 ? buffer : buffer.slice(0, markerIdx);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: answer };
          return copy;
        });
      }

      // Finalise: split answer + citations.
      const markerIdx = buffer.indexOf(CITATIONS_MARKER);
      let answer = buffer;
      let citations: Citation[] = [];
      if (markerIdx !== -1) {
        answer = buffer.slice(0, markerIdx);
        const rest = buffer.slice(markerIdx + CITATIONS_MARKER.length);
        try {
          citations = JSON.parse(rest);
        } catch {
          citations = [];
        }
      }
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: answer, citations };
        return copy;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat request failed');
      // Drop the empty assistant placeholder on error.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-lg border border-gray-800 bg-gray-900">
      {/* Header / company selector */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-800 p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">Scope:</span>
          <div className="w-56">
            <Select value={ticker} onChange={(e) => setTicker(e.target.value)}>
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.ticker}>
                  {c.ticker} — {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <span className="text-xs text-gray-500">FinSight Research Assistant</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
            Ask about management guidance, what was said on a topic, or compare companies.
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} streaming={loading && i === messages.length - 1} />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="mx-4 mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-gray-800 p-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask FinSight…"
          disabled={loading}
        />
        <Button onClick={send} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm',
          isUser ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-100'
        )}
      >
        <p className="whitespace-pre-wrap">
          {message.content}
          {streaming && !message.content && <span className="text-gray-400">Thinking…</span>}
        </p>
        {!isUser && message.citations && message.citations.length > 0 && (
          <Citations citations={message.citations} />
        )}
      </div>
    </div>
  );
}

function Citations({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-gray-700 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-200"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {citations.length} citation{citations.length === 1 ? '' : 's'}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {citations.map((c, i) => (
            <li key={i} className="rounded-md bg-gray-950 p-2 text-xs text-gray-400">
              <div className="mb-1 flex items-center gap-1 text-gray-500">
                <Quote className="h-3 w-3" />
                {c.period ? <span>{c.period}</span> : <span>excerpt</span>}
              </div>
              <p className="text-gray-300">{c.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
