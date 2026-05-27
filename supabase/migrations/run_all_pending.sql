-- =====================================================
-- Chạy file này trong Supabase SQL Editor
-- Gộp 002 + 003 + 004 — an toàn chạy nhiều lần
-- =====================================================

-- =========== 002: project_documents ===========

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS project_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  path        text NOT NULL,
  url         text NOT NULL,
  file_type   text NOT NULL DEFAULT 'unknown',
  uploaded_by uuid REFERENCES profiles ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_documents' AND policyname='proj_docs_select') THEN
    CREATE POLICY "proj_docs_select" ON project_documents FOR SELECT USING (is_project_member(project_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_documents' AND policyname='proj_docs_insert') THEN
    CREATE POLICY "proj_docs_insert" ON project_documents FOR INSERT WITH CHECK (is_project_member(project_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_documents' AND policyname='proj_docs_delete') THEN
    CREATE POLICY "proj_docs_delete" ON project_documents FOR DELETE USING (is_project_owner(project_id));
  END IF;
END $$;

-- =========== 003: document_chunks ===========

CREATE TABLE IF NOT EXISTS document_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects ON DELETE CASCADE NOT NULL,
  document_id  uuid REFERENCES project_documents ON DELETE CASCADE NOT NULL,
  content      text NOT NULL,
  embedding    vector(384) NOT NULL,
  chunk_index  int NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='document_chunks' AND policyname='chunks_select') THEN
    CREATE POLICY "chunks_select" ON document_chunks FOR SELECT USING (is_project_member(project_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='document_chunks' AND policyname='chunks_insert') THEN
    CREATE POLICY "chunks_insert" ON document_chunks FOR INSERT WITH CHECK (is_project_member(project_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='document_chunks' AND policyname='chunks_delete') THEN
    CREATE POLICY "chunks_delete" ON document_chunks FOR DELETE USING (is_project_owner(project_id));
  END IF;
END $$;

-- =========== 004: RAG v2 — thêm doc_type, fts, metadata + RPCs ===========

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'project_doc';

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
  ON document_chunks USING gin(fts);

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Upgrade match_document_chunks với doc_type filter
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

-- Hybrid search RPC (vector + keyword, re-ranked)
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
