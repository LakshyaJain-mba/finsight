-- Migration 001 — Guidance Accountability Engine, Spec v1.0 (Phase A: M0).
-- Additive and backward-compatible: widens enums, adds nullable columns and
-- two new tables. Safe to run on an existing FinSight database.

begin;

-- 1. Widen document type vocabulary.
alter table documents
  drop constraint if exists documents_doc_type_check;
alter table documents
  add constraint documents_doc_type_check
    check (doc_type in ('concall','annual_report','drhp','filing',
                        'quarterly_results','investor_presentation','rating_report'));

-- 2. Guidance statements: normalization columns.
alter table guidance_statements
  add column if not exists metric_key    varchar(40),
  add column if not exists polarity      varchar(20),
  add column if not exists target_period varchar(30),
  add column if not exists parsed_value  jsonb,
  add column if not exists is_active     boolean default true,
  add column if not exists superseded_by uuid references guidance_statements(id);

create index if not exists idx_guidance_metric_target
  on guidance_statements(company_id, metric_key, target_period);

-- 3. Guidance outcomes: enrichment + widened outcome states.
alter table guidance_outcomes
  add column if not exists method           varchar(30) default 'manual',
  add column if not exists confidence       decimal(4,3),
  add column if not exists variance         text,
  add column if not exists evidence_excerpt text,
  add column if not exists resolved_at      timestamptz,
  add column if not exists updated_at       timestamptz default now();

alter table guidance_outcomes
  drop constraint if exists guidance_outcomes_outcome_check;
alter table guidance_outcomes
  add constraint guidance_outcomes_outcome_check
    check (outcome in ('met','missed','exceeded','revised','pending',
                       'in_progress','unresolved_no_data'));

alter table guidance_outcomes
  drop constraint if exists guidance_outcomes_method_check;
alter table guidance_outcomes
  add constraint guidance_outcomes_method_check
    check (method in ('manual','ai_suggested','ai_auto','analyst_confirmed'));

-- 4. Extracted actuals (populated by M2/M3).
create table if not exists extracted_actuals (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  metric_key  varchar(40) not null,
  period      varchar(30) not null,
  value       jsonb not null,
  excerpt     text,
  confidence  decimal(4,3),
  created_at  timestamptz default now()
);

create index if not exists idx_actuals_match
  on extracted_actuals(company_id, metric_key, period);

-- 5. Revision events.
create table if not exists revision_events (
  id                uuid primary key default gen_random_uuid(),
  original_id       uuid references guidance_statements(id) on delete cascade,
  successor_id      uuid references guidance_statements(id) on delete cascade,
  direction         varchar(15) check (direction in ('UPGRADE','DOWNGRADE','REAFFIRMED')),
  delta_description text,
  created_at        timestamptz default now()
);

-- 6. Management scores: coverage / reliability fields.
alter table management_scores
  add column if not exists resolved_count int default 0,
  add column if not exists total_count    int default 0,
  add column if not exists status         varchar(15) default 'provisional';

alter table management_scores
  drop constraint if exists management_scores_status_check;
alter table management_scores
  add constraint management_scores_status_check
    check (status in ('provisional','rated'));

commit;
