-- =====================================================
-- Migration 002: Project Documents
-- Bảng lưu metadata file upload của project
-- =====================================================

-- Enable pgvector extension (nếu chưa có)
CREATE EXTENSION IF NOT EXISTS vector;

-- Storage bucket (tạo qua SQL trigger không được — làm qua Dashboard/API)
-- Bucket name: project-docs (public)

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

-- RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proj_docs_select" ON project_documents
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "proj_docs_insert" ON project_documents
  FOR INSERT WITH CHECK (is_project_member(project_id));

CREATE POLICY "proj_docs_delete" ON project_documents
  FOR DELETE USING (is_project_owner(project_id));
