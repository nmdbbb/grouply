-- =====================================================
-- Migration 003: Document Chunks
-- Bảng lưu chunks + embeddings (vector 384 chiều)
-- Dùng model all-MiniLM-L6-v2 qua @xenova/transformers
-- =====================================================

CREATE TABLE IF NOT EXISTS document_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects ON DELETE CASCADE NOT NULL,
  document_id  uuid REFERENCES project_documents ON DELETE CASCADE NOT NULL,
  content      text NOT NULL,
  embedding    vector(384) NOT NULL,
  chunk_index  int NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- Index cho vector similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chunks_select" ON document_chunks
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "chunks_insert" ON document_chunks
  FOR INSERT WITH CHECK (is_project_member(project_id));

CREATE POLICY "chunks_delete" ON document_chunks
  FOR DELETE USING (is_project_owner(project_id));

-- RPC: vector similarity search (sẽ được upgrade trong 004)
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding   vector(384),
  match_project_id  uuid,
  match_count       int DEFAULT 5
) RETURNS TABLE (
  content       text,
  document_name text,
  chunk_index   int,
  similarity    float
) AS $$
  SELECT
    dc.content,
    pd.name  AS document_name,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN project_documents pd ON pd.id = dc.document_id
  WHERE dc.project_id = match_project_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
