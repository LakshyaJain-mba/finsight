-- Enable pgvector
create extension if not exists vector;

create table companies (
  id uuid primary key default gen_random_uuid(),
  ticker varchar(20) unique not null,
  name text not null,
  sector text,
  exchange varchar(10) default 'NSE',
  created_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  doc_type varchar(30) check (doc_type in ('concall','annual_report','drhp','filing','quarterly_results','investor_presentation','rating_report')),
  period varchar(20),
  title text,
  storage_path text,
  raw_text text,
  processed boolean default false,
  created_at timestamptz default now()
);

create table guidance_statements (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  speaker text,
  metric text,
  statement text not null,
  guidance_type varchar(20) check (guidance_type in ('quantitative','qualitative','directional')),
  value_given text,
  timeframe text,
  qualifier text,
  confidence_signal varchar(20) check (confidence_signal in ('high','medium','hedged','vague')),
  period varchar(20),
  -- Spec v1.0 normalization columns
  metric_key varchar(40),
  polarity varchar(20),
  target_period varchar(30),
  parsed_value jsonb,
  is_active boolean default true,
  superseded_by uuid references guidance_statements(id),
  created_at timestamptz default now()
);

create table guidance_outcomes (
  id uuid primary key default gen_random_uuid(),
  guidance_id uuid references guidance_statements(id) on delete cascade,
  actual_value text,
  outcome varchar(20) check (outcome in ('met','missed','exceeded','revised','pending','in_progress','unresolved_no_data')) default 'pending',
  evidence_doc_id uuid references documents(id),
  notes text,
  -- Spec v1.0 enrichment
  method varchar(30) check (method in ('manual','ai_suggested','ai_auto','analyst_confirmed')) default 'manual',
  confidence decimal(4,3),
  variance text,
  evidence_excerpt text,
  resolved_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table management_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade unique,
  score decimal(5,2) default 0,
  guidance_hit_rate decimal(5,2) default 0,
  hedge_ratio decimal(5,2) default 0,
  revision_count int default 0,
  periods_analyzed int default 0,
  -- Spec v1.0 coverage / reliability
  resolved_count int default 0,
  total_count int default 0,
  status varchar(15) check (status in ('provisional','rated')) default 'provisional',
  last_updated timestamptz default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index int,
  content text,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz default now()
);

-- Extracted actuals (populated by the resolution engine, M2/M3)
create table extracted_actuals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  metric_key varchar(40) not null,
  period varchar(30) not null,
  value jsonb not null,
  excerpt text,
  confidence decimal(4,3),
  created_at timestamptz default now()
);

-- Revision events (guidance superseded before its period closes)
create table revision_events (
  id uuid primary key default gen_random_uuid(),
  original_id uuid references guidance_statements(id) on delete cascade,
  successor_id uuid references guidance_statements(id) on delete cascade,
  direction varchar(15) check (direction in ('UPGRADE','DOWNGRADE','REAFFIRMED')),
  delta_description text,
  created_at timestamptz default now()
);

create index on guidance_statements(company_id, metric);
create index on guidance_statements(period);
create index on guidance_statements(company_id, metric_key, target_period);
create index on extracted_actuals(company_id, metric_key, period);
create index on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Vector similarity search used by the document_rag agent path.
create or replace function match_chunks(
  query_embedding vector(1536),
  ticker_filter text,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join documents d on dc.document_id = d.id
  join companies c on d.company_id = c.id
  where c.ticker = ticker_filter
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
