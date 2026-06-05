'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { OutcomeEditor } from '@/components/OutcomeEditor';
import type { ReviewQueueItem } from '@/types';

interface ReviewQueueProps {
  items: ReviewQueueItem[];
}

export function ReviewQueue({ items }: ReviewQueueProps) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const visible = items.filter((i) => !resolved.has(i.id));

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-500">
        No statements are awaiting an outcome. 🎉
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        {visible.length} statement{visible.length === 1 ? '' : 's'} awaiting an outcome
      </p>
      {visible.map((item) => (
        <div key={item.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link
                href={`/company/${encodeURIComponent(item.ticker)}`}
                className="text-sm font-semibold text-indigo-300 hover:text-indigo-200"
              >
                {item.ticker}
              </Link>
              {item.metric_key && item.metric_key !== 'OTHER' ? (
                <Badge variant="indigo">{item.metric_key}</Badge>
              ) : item.metric ? (
                <Badge variant="gray">{item.metric}</Badge>
              ) : null}
              {(item.target_period || item.period) && (
                <span className="text-xs text-gray-500">
                  {item.target_period ?? item.period}
                </span>
              )}
            </div>
            {item.value_given && (
              <span className="text-xs text-gray-400">Promised: {item.value_given}</span>
            )}
          </div>
          <p className="text-sm text-gray-300">{item.statement}</p>
          <OutcomeEditor
            guidanceId={item.id}
            onSaved={() => setResolved((prev) => new Set(prev).add(item.id))}
          />
        </div>
      ))}
    </div>
  );
}
