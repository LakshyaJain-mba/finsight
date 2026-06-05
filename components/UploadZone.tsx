'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, UploadCloud, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ConcallCard } from '@/components/ConcallCard';
import { cn } from '@/lib/utils';
import type { Company, DocType, RawExtractionResult } from '@/types';

const DOC_TYPES: DocType[] = ['concall', 'annual_report', 'drhp', 'filing'];

interface ProcessResponse {
  document_id: string;
  statements_count: number;
  chunks_stored: number;
  statements: RawExtractionResult['statements'];
  summary: RawExtractionResult['summary'];
  management_tone: RawExtractionResult['management_tone'];
  key_themes: string[];
  warning?: string;
}

type Status = 'idle' | 'processing' | 'done' | 'error';

export function UploadZone() {
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newSector, setNewSector] = useState('');
  const [period, setPeriod] = useState('');
  const [docType, setDocType] = useState<DocType>('concall');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCompanies() {
    try {
      const res = await fetch('/api/companies');
      const json = await res.json();
      if (res.ok) {
        setCompanies(json.companies ?? []);
        if (!companyId && json.companies?.length) setCompanyId(json.companies[0].id);
      }
    } catch {
      /* surfaced on submit */
    }
  }

  async function createCompany() {
    setError(null);
    if (!newTicker.trim() || !newName.trim()) {
      setError('Ticker and name are required to create a company');
      return;
    }
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: newTicker, name: newName, sector: newSector }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to create company');
      return;
    }
    setCompanies((prev) => [json.company, ...prev]);
    setCompanyId(json.company.id);
    setShowCreate(false);
    setNewTicker('');
    setNewName('');
    setNewSector('');
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type.includes('pdf')) {
      setFile(dropped);
    } else {
      setError('Please drop a PDF file');
    }
  }

  async function submit() {
    setError(null);
    setResult(null);

    if (!companyId) return setError('Select or create a company');
    if (!period.trim()) return setError('Enter a period (e.g. Q2FY25)');
    if (mode === 'file' && !file) return setError('Choose a PDF file');
    if (mode === 'text' && !text.trim()) return setError('Paste transcript text');

    const form = new FormData();
    form.append('company_id', companyId);
    form.append('period', period.trim());
    form.append('doc_type', docType);
    if (mode === 'file' && file) form.append('file', file);
    if (mode === 'text') form.append('text', text);

    setStatus('processing');
    setProgress(15);
    const timer = setInterval(() => setProgress((p) => Math.min(90, p + 5)), 700);

    try {
      const res = await fetch('/api/process-document', { method: 'POST', body: form });
      const json = await res.json();
      clearInterval(timer);
      setProgress(100);
      if (!res.ok) {
        setStatus('error');
        setError(json.error ?? 'Processing failed');
        return;
      }
      setResult(json as ProcessResponse);
      setStatus('done');
    } catch (e) {
      clearInterval(timer);
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Processing failed');
    }
  }

  const selectedCompany = companies.find((c) => c.id === companyId);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        {/* Mode toggle */}
        <div className="mb-5 inline-flex rounded-md border border-gray-800 p-1">
          <button
            onClick={() => setMode('file')}
            className={cn(
              'rounded px-4 py-1.5 text-sm font-medium transition-colors',
              mode === 'file' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            )}
          >
            Upload PDF
          </button>
          <button
            onClick={() => setMode('text')}
            className={cn(
              'rounded px-4 py-1.5 text-sm font-medium transition-colors',
              mode === 'text' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            )}
          >
            Paste Text
          </button>
        </div>

        {/* File / text input */}
        {mode === 'file' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
              dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-gray-700 hover:border-gray-600'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-indigo-400" />
                <p className="text-sm text-gray-200">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-gray-500" />
                <p className="text-sm text-gray-300">Drag & drop a PDF, or click to browse</p>
              </>
            )}
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the earnings call transcript here..."
            className="min-h-[200px]"
          />
        )}

        {/* Metadata fields */}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-1">
            <Label>Company</Label>
            <Select
              value={showCreate ? '__create__' : companyId}
              onChange={(e) => {
                if (e.target.value === '__create__') {
                  setShowCreate(true);
                } else {
                  setShowCreate(false);
                  setCompanyId(e.target.value);
                }
              }}
            >
              <option value="" disabled>
                Select company
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ticker} — {c.name}
                </option>
              ))}
              <option value="__create__">+ Create new company</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Period</Label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="Q2FY25"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Document type</Label>
            <Select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Inline create company */}
        {showCreate && (
          <div className="mt-4 grid gap-3 rounded-md border border-gray-800 bg-gray-950 p-4 md:grid-cols-4">
            <Input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder="Ticker (e.g. INFY)"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Company name"
            />
            <Input
              value={newSector}
              onChange={(e) => setNewSector(e.target.value)}
              placeholder="Sector (optional)"
            />
            <Button variant="secondary" onClick={createCompany}>
              <Plus className="h-4 w-4" /> Create
            </Button>
          </div>
        )}

        {/* Submit */}
        <div className="mt-5 flex items-center gap-4">
          <Button onClick={submit} disabled={status === 'processing'}>
            {status === 'processing' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing…
              </>
            ) : (
              'Process Document'
            )}
          </Button>
          {selectedCompany && !showCreate && (
            <span className="text-xs text-gray-500">
              Target: {selectedCompany.ticker}
            </span>
          )}
        </div>

        {status === 'processing' && (
          <div className="mt-4">
            <Progress value={progress} />
            <p className="mt-2 text-xs text-gray-500">
              Extracting guidance, generating embeddings, and scoring management…
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {result?.warning && status === 'done' && (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {result.warning}
          </p>
        )}
      </div>

      {/* Result */}
      {status === 'done' && result && selectedCompany && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Extracted {result.statements_count} guidance statements ·{' '}
            {result.chunks_stored} chunks indexed
          </p>
          <ConcallCard
            result={{
              statements: result.statements,
              summary: result.summary,
              management_tone: result.management_tone,
              key_themes: result.key_themes,
            }}
            meta={{
              companyName: selectedCompany.name,
              period,
              docType,
            }}
          />
        </div>
      )}
    </div>
  );
}
