-- Migration 002 — add source period to match_chunks results.
-- Enables traceable chat citations (period) for the document_rag path.
-- Embedding dimension is unchanged (1536), so no re-embedding is required.
--
-- NOTE: adding the `period` column changes the function's RETURNS TABLE type.
-- Postgres forbids changing the return type via CREATE OR REPLACE, so we must
-- DROP the old function first. The signature (argument types) is unchanged.

drop function if exists match_chunks(vector, text, int);

create function match_chunks(
  query_embedding vector(1536),
  ticker_filter text,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  period varchar(20),
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    d.period,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join documents d on dc.document_id = d.id
  join companies c on d.company_id = c.id
  where c.ticker = ticker_filter
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
