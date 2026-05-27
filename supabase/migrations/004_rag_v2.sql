-- =====================================================
-- Migration 004: RAG v2
-- Thêm doc_type, fts, và hybrid search RPC
-- =====================================================

-- 1. Thêm doc_type vào document_chunks
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'project_doc';
-- Giá trị hợp lệ: 'project_doc' | 'activity_log'

-- 2. Thêm full-text search column (cho hybrid search)
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
-- Dùng 'simple' thay vì 'english' để handle tiếng Việt tốt hơn

CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
  ON document_chunks USING gin(fts);

-- 3. Thêm metadata column
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
-- activity_log: { "action_types": ["assign_tasks_batch"], "timestamp": "..." }
-- project_doc:  { "sub_type": "rubric" | "assignment_brief" | "reference" | "general" }

-- 4. Upgrade match_document_chunks — thêm doc_type filter
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding   vector(384),
  match_project_id  uuid,
  match_count       int     DEFAULT 5,
  filter_doc_type   text    DEFAULT NULL
) RETURNS TABLE (
  content       text,
  document_name text,
  chunk_index   int,
  similarity    float,
  doc_type      text,
  metadata      jsonb
) AS $$
  SELECT
    dc.content,
    pd.name  AS document_name,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.doc_type,
    dc.metadata
  FROM document_chunks dc
  JOIN project_documents pd ON pd.id = dc.document_id
  WHERE dc.project_id = match_project_id
    AND (filter_doc_type IS NULL OR dc.doc_type = filter_doc_type)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

-- 5. Hybrid search RPC (vector + keyword, re-ranked)
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
  query_embedding   vector(384),
  query_text        text,
  match_project_id  uuid,
  match_count       int     DEFAULT 5,
  filter_doc_type   text    DEFAULT NULL,
  vector_weight     float   DEFAULT 0.7,
  text_weight       float   DEFAULT 0.3
) RETURNS TABLE (
  content         text,
  document_name   text,
  chunk_index     int,
  combined_score  float,
  doc_type        text,
  metadata        jsonb
) AS $$
  WITH vector_pool AS (
    SELECT
      dc.id,
      dc.content,
      pd.name        AS document_name,
      dc.chunk_index,
      dc.doc_type,
      dc.metadata,
      1 - (dc.embedding <=> query_embedding) AS vsim
    FROM document_chunks dc
    JOIN project_documents pd ON pd.id = dc.document_id
    WHERE dc.project_id = match_project_id
      AND (filter_doc_type IS NULL OR dc.doc_type = filter_doc_type)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 4
  ),
  text_pool AS (
    SELECT
      dc.id,
      ts_rank(dc.fts, websearch_to_tsquery('simple', query_text)) AS trank
    FROM document_chunks dc
    WHERE dc.project_id = match_project_id
      AND (filter_doc_type IS NULL OR dc.doc_type = filter_doc_type)
      AND dc.fts @@ websearch_to_tsquery('simple', query_text)
  )
  SELECT
    vp.content,
    vp.document_name,
    vp.chunk_index,
    (vector_weight * vp.vsim + text_weight * COALESCE(tp.trank, 0)) AS combined_score,
    vp.doc_type,
    vp.metadata
  FROM vector_pool vp
  LEFT JOIN text_pool tp ON tp.id = vp.id
  ORDER BY (vector_weight * vp.vsim + text_weight * COALESCE(tp.trank, 0)) DESC
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
