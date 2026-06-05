'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { GuidanceOutcome, Outcome } from '@/types';

const OUTCOME_OPTIONS: Outcome[] = [
  'pending',
  'met',
  'exceeded',
  'missed',
  'revised',
  'in_progress',
];

interface OutcomeEditorProps {
  guidanceId: string;
  current?: GuidanceOutcome | null;
  onSaved?: () => void;
}

export function OutcomeEditor({ guidanceId, current, onSaved }: OutcomeEditorProps) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>(current?.outcome ?? 'pending');
  const [actualValue, setActualValue] = useState(current?.actual_value ?? '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/guidance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidance_id: guidanceId,
          outcome,
          actual_value: actualValue || undefined,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save outcome');
      setSaved(true);
      onSaved?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save outcome');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-gray-800 bg-gray-950 p-3">
      <div className="w-36">
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
          Outcome
        </label>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
          {OUTCOME_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-32">
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
          Actual value
        </label>
        <Input
          value={actualValue}
          onChange={(e) => setActualValue(e.target.value)}
          placeholder="e.g. 13%"
        />
      </div>
      <div className="min-w-[10rem] flex-1">
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
          Notes
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Evidence / context"
        />
      </div>
      <Button onClick={save} disabled={saving} size="sm">
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          'Save'
        )}
      </Button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </div>
  );
}
