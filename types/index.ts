// Database row types — mirror supabase/schema.sql

export type Exchange = 'NSE' | 'BSE';

export interface Company {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  exchange: string;
  created_at: string;
}

// Widened in Spec v1.0 (M0) to cover all guidance/actuals-bearing document types.
export type DocType =
  | 'concall'
  | 'annual_report'
  | 'drhp'
  | 'filing'
  | 'quarterly_results'
  | 'investor_presentation'
  | 'rating_report';

export interface Document {
  id: string;
  company_id: string;
  doc_type: DocType;
  period: string | null;
  title: string | null;
  storage_path: string | null;
  raw_text: string | null;
  processed: boolean;
  created_at: string;
}

export type GuidanceType = 'quantitative' | 'qualitative' | 'directional';
export type ConfidenceSignal = 'high' | 'medium' | 'hedged' | 'vague';

// ── Spec v1.0 intelligence-layer primitives ───────────────────────────────

export type Polarity =
  | 'HIGHER_BETTER'
  | 'LOWER_BETTER'
  | 'TARGET_ATTAINMENT'
  | 'CONTEXT_DEPENDENT';

export type ValueType = 'point' | 'range' | 'threshold' | 'directional';

export type ResolutionMethod =
  | 'RM-DELTA-YOY'
  | 'RM-LEVEL'
  | 'RM-ABS'
  | 'RM-RATIO'
  | 'RM-CAGR'
  | 'RM-PLAN-ATTAIN'
  | 'RM-DIRECTION'
  | 'RM-THRESHOLD'
  | 'RM-NARRATIVE';

export interface ParsedValue {
  type: ValueType | null;
  low: number | null;
  high: number | null;
  unit: string | null;
  direction: 'up' | 'down' | 'flat' | null;
  raw: string | null;
  confidence_v: number;
  // True when the value's unit hard-contradicts the metric's expected unit
  // (e.g. a currency figure for a percentage metric). Optional for backward
  // compatibility with rows/objects created before this flag existed.
  unit_mismatch?: boolean;
}

export type OutcomeMethod = 'manual' | 'ai_suggested' | 'ai_auto' | 'analyst_confirmed';
export type ScoreStatus = 'provisional' | 'rated';
export type ConfidenceTier = 'T1' | 'T2' | 'T3';
export type RevisionDirection = 'UPGRADE' | 'DOWNGRADE' | 'REAFFIRMED';

export interface MetricConfig {
  key: string;
  aliases: string[];
  unit: string;
  polarity: Polarity;
  resolution_method: ResolutionMethod;
  sector?: string;
  confidence_notes?: string;
}

export interface ConfidenceComponents {
  m: number; // metric match
  p: number; // period match
  v: number; // value-parse certainty
  t: number; // guidance-type gradeability
  a: number; // source authority
}

// ───────────────────────────────────────────────────────────────────────────

export interface GuidanceStatement {
  id: string;
  document_id: string;
  company_id: string;
  speaker: string | null;
  metric: string | null;
  statement: string;
  guidance_type: GuidanceType | null;
  value_given: string | null;
  timeframe: string | null;
  qualifier: string | null;
  confidence_signal: ConfidenceSignal | null;
  period: string | null;
  created_at: string;
  // Spec v1.0 normalization columns (nullable for rows predating the engine).
  metric_key: string | null;
  polarity: Polarity | null;
  target_period: string | null;
  parsed_value: ParsedValue | null;
  is_active: boolean | null;
  superseded_by: string | null;
}

export type Outcome =
  | 'met'
  | 'missed'
  | 'exceeded'
  | 'revised'
  | 'pending'
  | 'in_progress'
  | 'unresolved_no_data';

export interface GuidanceOutcome {
  id: string;
  guidance_id: string;
  actual_value: string | null;
  outcome: Outcome;
  evidence_doc_id: string | null;
  notes: string | null;
  created_at: string;
  // Spec v1.0 enrichment.
  method: OutcomeMethod;
  confidence: number | null;
  variance: string | null;
  evidence_excerpt: string | null;
  resolved_at: string | null;
  updated_at: string | null;
}

export interface ManagementScore {
  id: string;
  company_id: string;
  score: number;
  guidance_hit_rate: number;
  hedge_ratio: number;
  revision_count: number;
  periods_analyzed: number;
  last_updated: string;
  // Spec v1.0 coverage/reliability fields.
  resolved_count: number;
  total_count: number;
  status: ScoreStatus;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Actuals + revision tables (created in M0; populated by M2/M3 later).
export interface ExtractedActual {
  id: string;
  company_id: string;
  document_id: string;
  metric_key: string;
  period: string;
  value: ParsedValue;
  excerpt: string | null;
  confidence: number | null;
  created_at: string;
}

export interface RevisionEvent {
  id: string;
  original_id: string;
  successor_id: string;
  direction: RevisionDirection;
  delta_description: string | null;
  created_at: string;
}

// Computed credibility result (pure scoring output).
export interface ScoreResult {
  score: number;
  guidance_hit_rate: number;
  hedge_ratio: number;
  revision_count: number;
  periods_analyzed: number;
  resolved_count: number;
  total_count: number;
  status: ScoreStatus;
}

// Joined / derived shapes used by the UI and API layers

export interface GuidanceStatementWithOutcome extends GuidanceStatement {
  guidance_outcomes: GuidanceOutcome[] | null;
  documents: Pick<Document, 'period' | 'title'> | null;
}

export interface CompanyWithScore extends Company {
  management_scores: ManagementScore | ManagementScore[] | null;
}

// Review-queue row (pending statements awaiting an outcome).
export interface ReviewQueueItem {
  id: string;
  company_id: string;
  ticker: string;
  company_name: string;
  metric: string | null;
  metric_key: string | null;
  statement: string;
  value_given: string | null;
  timeframe: string | null;
  target_period: string | null;
  period: string | null;
  outcome: Outcome;
}

// Additional application types

export interface ExtractionResult {
  statements: GuidanceStatement[];
  summary: { positive: string[]; negative: string[]; neutral: string[] };
  management_tone: 'confident' | 'cautious' | 'defensive' | 'evasive';
  key_themes: string[];
}

export interface AgentIntent {
  type: 'guidance_lookup' | 'document_rag' | 'peer_comparison' | 'calculation' | 'general';
  company_ticker?: string;
  metric?: string;
  timeframe?: string;
  confidence: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: { document_id: string; period: string; excerpt: string }[];
}

// Raw guidance shape returned by the extraction model (before DB persistence).
// The model emits the analytical fields but not DB identifiers.
export type ExtractedGuidance = Pick<
  GuidanceStatement,
  | 'speaker'
  | 'metric'
  | 'statement'
  | 'guidance_type'
  | 'value_given'
  | 'timeframe'
  | 'qualifier'
  | 'confidence_signal'
> & {
  // Optional hints the model may emit; otherwise derived deterministically.
  metric_key?: string | null;
  value_type?: ValueType | null;
};

export interface RawExtractionResult {
  statements: ExtractedGuidance[];
  summary: { positive: string[]; negative: string[]; neutral: string[] };
  management_tone: 'confident' | 'cautious' | 'defensive' | 'evasive';
  key_themes: string[];
}

export interface Citation {
  document_id: string;
  period: string;
  excerpt: string;
}

export interface OutcomeUpdatePayload {
  guidance_id: string;
  outcome: Outcome;
  actual_value?: string;
  notes?: string;
  evidence_doc_id?: string;
}
