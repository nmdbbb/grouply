# Grouply RAG Implementation Guide

> Tài liệu này dùng để đưa cho Claude (Claude Code, Claude.ai, hoặc bất kỳ AI agent nào) để implement toàn bộ các thay đổi cần thiết. Đọc hết trước khi bắt đầu code.

---

## Mục tiêu

Refine hệ thống RAG hiện có của Grouply để:

1. **Replan Memory** — lưu lại lịch sử replan đã confirm vào vector store, để lần sau AI retrieve tình huống tương tự làm precedent
2. **Metadata-aware chunking** — chunk có thêm `doc_type` để filter khi retrieve
3. **Hybrid search** — kết hợp cosine similarity (pgvector) với full-text search (tsvector) của Postgres
4. **Thêm 2 AI tools mới** — `search_replans` và upgrade `search_documents` với metadata filter

---

## Kiến trúc hiện tại (context cho implementer)

```
Tech stack:
- Next.js 16 (App Router), TypeScript
- Supabase (PostgreSQL + pgvector + Auth + Storage + Realtime)
- Embedding: @xenova/transformers — all-MiniLM-L6-v2 (dim=384, chạy local Node.js)
- AI: @anthropic-ai/sdk (Claude Sonnet) + groq-sdk (Llama 3.3 70B)
- State: Zustand

File structure liên quan:
- lib/ai/tools.ts         — tool definitions (Anthropic format)
- lib/ai/execute.ts       — tool execution (server-side)
- lib/ai/prompts.ts       — system prompt builder
- lib/ai/context.ts       — build ProjectContext từ Supabase
- lib/ai/chunker.ts       — split text → chunks
- lib/ai/embed.ts         — local embedding (Transformers.js)
- lib/ai/retrieval.ts     — vector search từ Supabase pgvector
- app/api/ai/chat/route.ts — core AI endpoint (SSE streaming)
- app/api/project/upload-doc/route.ts — upload + embed documents
- supabase/migrations/    — SQL migrations
- types/index.ts          — TypeScript interfaces
```

### Schema hiện tại (đã có)

```sql
-- document_chunks (migration 003)
CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  document_id uuid REFERENCES project_documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(384) NOT NULL,
  chunk_index int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Retrieval hiện tại (đã có)

```sql
-- match_document_chunks RPC
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(384),
  match_project_id uuid,
  match_count int DEFAULT 5
) RETURNS TABLE (
  content text,
  document_name text,
  chunk_index int,
  similarity float
) AS $$
  SELECT dc.content, pd.name AS document_name, dc.chunk_index,
         1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN project_documents pd ON pd.id = dc.document_id
  WHERE dc.project_id = match_project_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

### Chunker hiện tại (đã có)

```typescript
// lib/ai/chunker.ts
// Chunk size: 500 chars, overlap: 80 chars
// Break points: \n\n > \n > ". " > "! " > "? " > " "
// Filter: bỏ chunks < 20 chars
```

### Embed hiện tại (đã có)

```typescript
// lib/ai/embed.ts
// Model: Xenova/all-MiniLM-L6-v2 (dim=384)
// Singleton pipeline — load 1 lần, cache trong memory
// export async function embedText(text: string): Promise<number[]>
// export async function embedTexts(texts: string[]): Promise<number[][]>
```

---

## PHẦN 1: Replan Memory System

### 1.1 Database Migration

Tạo file: `supabase/migrations/004_replan_memory.sql`

```sql
-- ============================================
-- Migration 004: Replan Memory for RAG
-- ============================================

-- Bảng lưu replan events đã được confirm
CREATE TABLE replan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Trigger info
  trigger_type text NOT NULL,
  -- Giá trị: 'slow_progress' | 'member_silent' | 'dependency_blocked' | 'multiple_delayed'
  trigger_detail jsonb NOT NULL DEFAULT '{}',
  -- Ví dụ: { "task_ids": [...], "member_id": "...", "days_silent": 4 }

  -- Tình huống tại thời điểm replan
  context_snapshot jsonb NOT NULL DEFAULT '{}',
  -- Chứa:
  -- {
  --   "days_remaining": 8,
  --   "days_total": 14,
  --   "overall_progress_pct": 35,
  --   "members_status": [
  --     { "name": "Hùng", "task": "Phân tích thị trường", "progress": 40, "days_inactive": 3 }
  --   ],
  --   "at_risk_tasks": [...]
  -- }

  -- Actions đã thực hiện (sau khi user confirm)
  actions_taken jsonb NOT NULL DEFAULT '[]',
  -- Ví dụ: [
  --   { "type": "reassign_support", "from_member": "Lan", "to_task": "...", "reason": "..." },
  --   { "type": "reduce_scope", "task_id": "...", "removed_parts": ["phần optional X"] },
  --   { "type": "reorder", "task_id": "...", "new_dependency": "..." },
  --   { "type": "sync_meeting", "suggested_duration": 30 }
  -- ]

  -- Kết quả (updated thủ công hoặc tự đánh giá sau 2-3 ngày)
  outcome text DEFAULT 'pending',
  -- Giá trị: 'pending' | 'resolved' | 'partially_resolved' | 'ignored' | 'escalated'
  outcome_notes text,

  -- Metadata
  confirmed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);

-- RLS
ALTER TABLE replan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view replan events"
  ON replan_events FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Owner can insert replan events"
  ON replan_events FOR INSERT
  WITH CHECK (is_project_owner(project_id));

CREATE POLICY "Owner can update replan events"
  ON replan_events FOR UPDATE
  USING (is_project_owner(project_id));

-- Vector chunks cho replan events (cùng mô hình với document_chunks)
CREATE TABLE replan_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES replan_events(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(384) NOT NULL,
  chunk_index int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON replan_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE replan_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view replan chunks"
  ON replan_chunks FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "System can insert replan chunks"
  ON replan_chunks FOR INSERT
  WITH CHECK (is_project_member(project_id));

-- RPC function cho vector search replan memory
CREATE OR REPLACE FUNCTION match_replan_chunks(
  query_embedding vector(384),
  match_project_id uuid,
  match_count int DEFAULT 3
) RETURNS TABLE (
  content text,
  event_id uuid,
  trigger_type text,
  outcome text,
  similarity float,
  created_at timestamptz
) AS $$
  SELECT
    rc.content,
    rc.event_id,
    re.trigger_type,
    re.outcome,
    1 - (rc.embedding <=> query_embedding) AS similarity,
    re.created_at
  FROM replan_chunks rc
  JOIN replan_events re ON re.id = rc.event_id
  WHERE rc.project_id = match_project_id
  ORDER BY rc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

### 1.2 TypeScript Types

Thêm vào `types/index.ts`:

```typescript
export interface ReplanEvent {
  id: string;
  project_id: string;
  trigger_type: 'slow_progress' | 'member_silent' | 'dependency_blocked' | 'multiple_delayed';
  trigger_detail: Record<string, any>;
  context_snapshot: {
    days_remaining: number;
    days_total: number;
    overall_progress_pct: number;
    members_status: Array<{
      name: string;
      task: string;
      progress: number;
      days_inactive: number;
    }>;
    at_risk_tasks: string[];
  };
  actions_taken: Array<{
    type: 'reassign_support' | 'reduce_scope' | 'reorder' | 'sync_meeting';
    [key: string]: any;
  }>;
  outcome: 'pending' | 'resolved' | 'partially_resolved' | 'ignored' | 'escalated';
  outcome_notes?: string;
  confirmed_by?: string;
  created_at: string;
  confirmed_at?: string;
}

export interface ReplanChunk {
  id: string;
  project_id: string;
  event_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
}
```

### 1.3 Replan Indexing Logic

Tạo file: `lib/ai/replan-memory.ts`

Chức năng: khi một replan event được confirm, tạo summary text → chunk → embed → insert vào `replan_chunks`.

```typescript
// lib/ai/replan-memory.ts

import { createClient } from '@/lib/supabase/server';
import { chunkText } from './chunker';
import { embedTexts } from './embed';
import type { ReplanEvent } from '@/types';

/**
 * Tạo text summary từ replan event để embed.
 * Summary phải chứa đủ context để khi retrieve, AI hiểu được tình huống.
 */
function buildReplanSummary(event: ReplanEvent): string {
  const { trigger_type, trigger_detail, context_snapshot, actions_taken, outcome } = event;

  const lines: string[] = [];

  // Tình huống
  lines.push(`Replan trigger: ${trigger_type}`);
  lines.push(`Context: ${context_snapshot.days_remaining} ngày còn lại / ${context_snapshot.days_total} tổng, tiến độ ${context_snapshot.overall_progress_pct}%`);

  // Thành viên có vấn đề
  const atRiskMembers = context_snapshot.members_status.filter(m => m.days_inactive >= 2 || m.progress < 40);
  if (atRiskMembers.length > 0) {
    lines.push(`Thành viên có vấn đề: ${atRiskMembers.map(m => `${m.name} (${m.task}: ${m.progress}%, ${m.days_inactive} ngày không hoạt động)`).join('; ')}`);
  }

  // Trigger detail
  if (trigger_detail.task_ids) {
    lines.push(`Tasks liên quan: ${trigger_detail.task_ids.length} tasks`);
  }
  if (trigger_detail.days_silent) {
    lines.push(`Số ngày im lặng: ${trigger_detail.days_silent}`);
  }

  // Hành động đã thực hiện
  lines.push(`Actions: ${actions_taken.map(a => a.type).join(', ')}`);
  for (const action of actions_taken) {
    if (action.type === 'reassign_support') {
      lines.push(`- Chuyển ${action.from_member} hỗ trợ task "${action.to_task}"`);
    } else if (action.type === 'reduce_scope') {
      lines.push(`- Thu hẹp scope: bỏ ${(action.removed_parts || []).join(', ')}`);
    } else if (action.type === 'reorder') {
      lines.push(`- Thay đổi thứ tự dependency`);
    } else if (action.type === 'sync_meeting') {
      lines.push(`- Gợi ý họp sync ${action.suggested_duration || 30} phút`);
    }
  }

  // Kết quả
  lines.push(`Outcome: ${outcome}`);

  return lines.join('\n');
}

/**
 * Index một replan event vào vector store.
 * Gọi hàm này SAU KHI user confirm replan.
 */
export async function indexReplanEvent(event: ReplanEvent): Promise<void> {
  const supabase = await createClient();
  const summary = buildReplanSummary(event);

  // Chunk summary (thường ngắn nên sẽ là 1-2 chunks)
  const chunks = chunkText(summary);

  // Embed tất cả chunks
  const embeddings = await embedTexts(chunks.map(c => c.content));

  // Insert vào replan_chunks
  const rows = chunks.map((chunk, i) => ({
    project_id: event.project_id,
    event_id: event.id,
    content: chunk.content,
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: i,
  }));

  const { error } = await supabase.from('replan_chunks').insert(rows);

  if (error) {
    console.error('Failed to index replan event:', error);
    throw error;
  }
}
```

### 1.4 Retrieval Function

Thêm vào `lib/ai/retrieval.ts` (bên cạnh function hiện có):

```typescript
/**
 * Semantic search replan memory.
 * Trả về các replan events tương tự với tình huống hiện tại.
 */
export async function searchReplans(
  query: string,
  projectId: string,
  matchCount: number = 3
): Promise<Array<{
  content: string;
  event_id: string;
  trigger_type: string;
  outcome: string;
  similarity: number;
  created_at: string;
}>> {
  const supabase = await createClient();
  const queryEmbedding = await embedText(query);

  const { data, error } = await supabase.rpc('match_replan_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_project_id: projectId,
    match_count: matchCount,
  });

  if (error) {
    console.error('searchReplans error:', error);
    return [];
  }

  return data || [];
}
```

---

## PHẦN 2: Metadata-aware Chunking

### 2.1 Sửa document_chunks schema

Tạo migration: `supabase/migrations/005_chunk_metadata.sql`

```sql
-- Thêm doc_type vào document_chunks
ALTER TABLE document_chunks
  ADD COLUMN doc_type text DEFAULT 'general';
-- Giá trị: 'assignment_brief' | 'rubric' | 'reference' | 'report' | 'general'

-- Thêm full-text search column (cho hybrid search ở Phần 3)
ALTER TABLE document_chunks
  ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX idx_document_chunks_fts ON document_chunks USING gin(fts);

-- Cập nhật match_document_chunks để support doc_type filter
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(384),
  match_project_id uuid,
  match_count int DEFAULT 5,
  filter_doc_type text DEFAULT NULL
) RETURNS TABLE (
  content text,
  document_name text,
  chunk_index int,
  similarity float,
  doc_type text
) AS $$
  SELECT
    dc.content,
    pd.name AS document_name,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.doc_type
  FROM document_chunks dc
  JOIN project_documents pd ON pd.id = dc.document_id
  WHERE dc.project_id = match_project_id
    AND (filter_doc_type IS NULL OR dc.doc_type = filter_doc_type)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

### 2.2 Sửa chunker.ts

Thêm logic phát hiện doc_type tự động:

```typescript
// Thêm vào lib/ai/chunker.ts

/**
 * Detect doc_type từ nội dung và filename.
 * Heuristic đơn giản — kiểm tra keywords.
 */
export function detectDocType(
  text: string,
  filename: string
): 'assignment_brief' | 'rubric' | 'reference' | 'report' | 'general' {
  const lower = text.toLowerCase();
  const nameLower = filename.toLowerCase();

  // Rubric detection
  if (
    nameLower.includes('rubric') ||
    lower.includes('tiêu chí chấm') ||
    lower.includes('grading criteria') ||
    lower.includes('scoring rubric') ||
    (lower.includes('điểm') && lower.includes('tiêu chí')) ||
    /\b\d+\s*%\s*.{5,50}(điểm|point|mark)/i.test(text)
  ) {
    return 'rubric';
  }

  // Assignment brief detection
  if (
    nameLower.includes('đề bài') ||
    nameLower.includes('assignment') ||
    nameLower.includes('brief') ||
    lower.includes('yêu cầu bài tập') ||
    lower.includes('deadline nộp') ||
    lower.includes('submission deadline') ||
    (lower.includes('deliverable') && lower.includes('requirement'))
  ) {
    return 'assignment_brief';
  }

  // Report detection
  if (
    nameLower.includes('report') ||
    nameLower.includes('báo cáo') ||
    (lower.includes('mục lục') && lower.includes('kết luận'))
  ) {
    return 'report';
  }

  // Reference detection
  if (
    nameLower.includes('tài liệu') ||
    nameLower.includes('reference') ||
    nameLower.includes('handbook') ||
    lower.includes('tham khảo')
  ) {
    return 'reference';
  }

  return 'general';
}
```

### 2.3 Sửa upload-doc/route.ts

Trong phần async embed pipeline, thêm doc_type:

```typescript
// Tìm đoạn code hiện tại nơi insert document_chunks
// Sửa để thêm doc_type

const docType = detectDocType(extractedText, filename);

const rows = chunks.map((chunk, i) => ({
  project_id: projectId,
  document_id: documentId,
  content: chunk.content,
  embedding: JSON.stringify(embeddings[i]),
  chunk_index: i,
  doc_type: docType,  // ← THÊM
}));
```

---

## PHẦN 3: Hybrid Search

### 3.1 RPC function mới

Thêm vào migration `005_chunk_metadata.sql`:

```sql
-- Hybrid search: kết hợp vector similarity + full-text search
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
  query_embedding vector(384),
  query_text text,
  match_project_id uuid,
  match_count int DEFAULT 5,
  filter_doc_type text DEFAULT NULL,
  vector_weight float DEFAULT 0.7,
  text_weight float DEFAULT 0.3
) RETURNS TABLE (
  content text,
  document_name text,
  chunk_index int,
  combined_score float,
  vector_similarity float,
  text_rank float,
  doc_type text
) AS $$
  WITH vector_results AS (
    SELECT
      dc.id,
      dc.content,
      pd.name AS document_name,
      dc.chunk_index,
      dc.doc_type,
      1 - (dc.embedding <=> query_embedding) AS vsim
    FROM document_chunks dc
    JOIN project_documents pd ON pd.id = dc.document_id
    WHERE dc.project_id = match_project_id
      AND (filter_doc_type IS NULL OR dc.doc_type = filter_doc_type)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 3  -- lấy nhiều hơn để re-rank
  ),
  text_results AS (
    SELECT
      dc.id,
      ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) AS trank
    FROM document_chunks dc
    WHERE dc.project_id = match_project_id
      AND dc.fts @@ websearch_to_tsquery('english', query_text)
      AND (filter_doc_type IS NULL OR dc.doc_type = filter_doc_type)
  )
  SELECT
    vr.content,
    vr.document_name,
    vr.chunk_index,
    (vector_weight * vr.vsim + text_weight * COALESCE(tr.trank, 0)) AS combined_score,
    vr.vsim AS vector_similarity,
    COALESCE(tr.trank, 0) AS text_rank,
    vr.doc_type
  FROM vector_results vr
  LEFT JOIN text_results tr ON tr.id = vr.id
  ORDER BY (vector_weight * vr.vsim + text_weight * COALESCE(tr.trank, 0)) DESC
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

### 3.2 Sửa retrieval.ts

```typescript
// Thêm hybrid search function vào lib/ai/retrieval.ts

export async function hybridSearchDocuments(
  query: string,
  projectId: string,
  options?: {
    matchCount?: number;
    docType?: string | null;
    vectorWeight?: number;
    textWeight?: number;
  }
): Promise<Array<{
  content: string;
  document_name: string;
  chunk_index: number;
  combined_score: number;
  vector_similarity: number;
  text_rank: number;
  doc_type: string;
}>> {
  const supabase = await createClient();
  const queryEmbedding = await embedText(query);

  const { data, error } = await supabase.rpc('hybrid_search_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: query,
    match_project_id: projectId,
    match_count: options?.matchCount ?? 5,
    filter_doc_type: options?.docType ?? null,
    vector_weight: options?.vectorWeight ?? 0.7,
    text_weight: options?.textWeight ?? 0.3,
  });

  if (error) {
    console.error('hybridSearchDocuments error:', error);
    return [];
  }

  return data || [];
}
```

---

## PHẦN 4: AI Tools

### 4.1 Sửa tools.ts — thêm 2 tools mới

Thêm vào mảng tool definitions:

```typescript
// Tool: search_replans (READ tool — auto-execute trong agentic loop)
{
  name: 'search_replans',
  description: `Tìm kiếm các tình huống replan tương tự trong lịch sử dự án.
Dùng khi:
- Đang cần đề xuất replan và muốn tham khảo cách nhóm đã xử lý tình huống tương tự trước đó
- Người dùng hỏi "lần trước mình xử lý trường hợp này như nào?"
- Cần precedent để đưa ra gợi ý có cơ sở thực tế

Trả về: tình huống cũ (trigger, context, actions đã làm, kết quả)`,
  input_schema: {
    type: 'object',
    properties: {
      situation: {
        type: 'string',
        description: 'Mô tả tình huống hiện tại cần tìm precedent. Ví dụ: "thành viên Hùng không có hoạt động 4 ngày, task phân tích thị trường mới xong 30%"',
      },
      match_count: {
        type: 'number',
        description: 'Số kết quả trả về (mặc định 3)',
        default: 3,
      },
    },
    required: ['situation'],
  },
},

// Upgrade search_documents — thêm doc_type filter và hybrid option
// TÌM tool search_documents hiện tại và SỬA input_schema:
{
  name: 'search_documents',
  description: `Tìm kiếm tài liệu đã upload theo ngữ nghĩa (semantic search).
Dùng khi:
- Người dùng hỏi về nội dung đề bài, rubric, hoặc tài liệu tham khảo
- Cần thông tin từ file đã upload để trả lời câu hỏi
- Cần đọc rubric để biết trọng số điểm

Mới: có thể filter theo doc_type và dùng hybrid search.`,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Câu truy vấn tìm kiếm',
      },
      doc_type: {
        type: 'string',
        enum: ['assignment_brief', 'rubric', 'reference', 'report', 'general'],
        description: 'Filter theo loại tài liệu. Dùng "rubric" khi hỏi về điểm/tiêu chí, "assignment_brief" khi hỏi về yêu cầu đề bài. Bỏ trống để tìm tất cả.',
      },
      match_count: {
        type: 'number',
        description: 'Số kết quả trả về (mặc định 5)',
        default: 5,
      },
      use_hybrid: {
        type: 'boolean',
        description: 'Dùng hybrid search (vector + keyword). Bật khi query chứa keyword cụ thể (tên riêng, số liệu, thuật ngữ chuyên ngành). Mặc định false.',
        default: false,
      },
    },
    required: ['query'],
  },
},
```

### 4.2 Sửa execute.ts — thêm execution logic

Trong switch/case `executeToolCall()`:

```typescript
case 'search_replans': {
  const { situation, match_count = 3 } = toolInput;
  const results = await searchReplans(situation, projectId, match_count);

  if (results.length === 0) {
    return { result: 'Chưa có lịch sử replan nào trong dự án này.' };
  }

  const formatted = results.map((r, i) => [
    `[${i + 1}] (similarity: ${(r.similarity * 100).toFixed(0)}%)`,
    `Trigger: ${r.trigger_type}`,
    `Outcome: ${r.outcome}`,
    `Date: ${new Date(r.created_at).toLocaleDateString('vi-VN')}`,
    `Detail: ${r.content}`,
    '---',
  ].join('\n')).join('\n');

  return { result: `Tìm thấy ${results.length} tình huống tương tự:\n\n${formatted}` };
}

case 'search_documents': {
  const { query, doc_type, match_count = 5, use_hybrid = false } = toolInput;

  let results;
  if (use_hybrid) {
    results = await hybridSearchDocuments(query, projectId, {
      matchCount: match_count,
      docType: doc_type || null,
    });
    // Map to common format
    results = results.map(r => ({
      content: r.content,
      document_name: r.document_name,
      chunk_index: r.chunk_index,
      similarity: r.combined_score,
      doc_type: r.doc_type,
    }));
  } else {
    // Dùng match_document_chunks hiện tại nhưng với doc_type filter
    results = await searchDocuments(query, projectId, match_count, doc_type || null);
  }

  if (results.length === 0) {
    return { result: 'Không tìm thấy nội dung liên quan trong tài liệu.' };
  }

  const formatted = results.map((r: any, i: number) => [
    `[${i + 1}] ${r.document_name} (chunk ${r.chunk_index}, score: ${(r.similarity * 100).toFixed(0)}%${r.doc_type ? ', type: ' + r.doc_type : ''})`,
    r.content,
    '---',
  ].join('\n')).join('\n');

  return { result: formatted };
}
```

### 4.3 Register search_replans as READ tool

Trong agentic loop (cả Anthropic và Groq), `search_replans` phải được xử lý như READ tool — tức là auto-execute và feed result lại vòng tiếp, KHÔNG dừng chờ user confirm.

Tìm đoạn code phân loại read/write tools và thêm `'search_replans'` vào danh sách read tools:

```typescript
// Trong agentic loop
const READ_TOOLS = [
  'search_documents',
  'search_replans',     // ← THÊM
  'read_project',
  'read_task',
  'read_member_load',
  'read_tasks_by_section',
];

// Phân loại
const isReadTool = READ_TOOLS.includes(toolCall.name);
```

---

## PHẦN 5: Integrate Replan Event Creation

### 5.1 Khi nào tạo replan_event

Trong flow hiện tại, khi AI đề xuất replan và user nhấn Commit:

1. Write tools được execute (reassign, update task, etc.)
2. **SAU KHI commit thành công**, tạo replan_event từ tool calls
3. Index replan event vào vector store (async, không block)

### 5.2 Sửa commit flow trong route.ts

```typescript
// Sau khi executeToolCalls() thành công cho một batch có replan-related tools

import { indexReplanEvent } from '@/lib/ai/replan-memory';

// Detect nếu batch này là replan (chứa reassign, update status, etc.)
const isReplanBatch = commitToolCalls.some(tc =>
  tc.name === 'assign_tasks_batch' ||
  (tc.name === 'update_task' && tc.input?.status) ||
  tc.name === 'add_task'  // thêm task mới trong replan
);

if (isReplanBatch) {
  // Tạo replan event
  const replanEvent = {
    project_id: projectId,
    trigger_type: detectTriggerType(commitToolCalls, projectContext),
    trigger_detail: buildTriggerDetail(commitToolCalls, projectContext),
    context_snapshot: buildContextSnapshot(projectContext),
    actions_taken: commitToolCalls.map(tc => ({
      type: mapToolToActionType(tc.name),
      ...tc.input,
    })),
    outcome: 'pending',
    confirmed_by: userId,
    confirmed_at: new Date().toISOString(),
  };

  const { data: event } = await supabase
    .from('replan_events')
    .insert(replanEvent)
    .select()
    .single();

  // Async index — không block response
  if (event) {
    indexReplanEvent(event as ReplanEvent).catch(err =>
      console.error('Failed to index replan event:', err)
    );
  }
}
```

### 5.3 Helper functions

```typescript
function detectTriggerType(
  toolCalls: ToolCall[],
  context: ProjectContext
): string {
  // Heuristic: nhìn vào loại tool calls để suy ra trigger type
  const hasReassign = toolCalls.some(tc => tc.name === 'assign_tasks_batch');
  const hasUpdateStatus = toolCalls.some(tc =>
    tc.name === 'update_task' && tc.input?.status
  );

  // Simple heuristic — cải thiện dần
  if (hasReassign) return 'member_silent';
  if (hasUpdateStatus) return 'slow_progress';
  return 'multiple_delayed';
}

function buildContextSnapshot(context: ProjectContext) {
  // Extract từ projectContext hiện có
  return {
    days_remaining: context.daysRemaining,
    days_total: context.daysTotal,
    overall_progress_pct: context.overallProgress,
    members_status: context.members.map(m => ({
      name: m.name,
      task: m.currentTask || '',
      progress: m.progress || 0,
      days_inactive: m.daysInactive || 0,
    })),
    at_risk_tasks: context.atRiskTasks || [],
  };
}

function mapToolToActionType(toolName: string): string {
  const map: Record<string, string> = {
    assign_tasks_batch: 'reassign_support',
    update_task: 'reduce_scope',
    set_dependency: 'reorder',
    add_task: 'add_support_task',
  };
  return map[toolName] || toolName;
}
```

---

## PHẦN 6: System Prompt Update

### 6.1 Sửa prompts.ts

Thêm đoạn sau vào system prompt (trong `buildSystemPrompt()`):

```typescript
// Thêm vào phần "Tool usage rules"
const replanMemoryPrompt = `
## Replan Memory
Khi cần đề xuất replan cho nhóm:
1. TRƯỚC KHI đề xuất, gọi search_replans với mô tả tình huống hiện tại
2. Nếu tìm được precedent, tham khảo outcome của lần trước:
   - outcome = 'resolved' → gợi ý tương tự, có thể điều chỉnh
   - outcome = 'partially_resolved' → gợi ý tương tự nhưng bổ sung thêm
   - outcome = 'ignored' hoặc 'escalated' → thử cách khác
3. Trích dẫn precedent khi đề xuất: "Lần trước nhóm đã xử lý tình huống tương tự bằng cách..."
4. Nếu không có precedent, đề xuất dựa trên nguyên tắc chung

## Document Search
Khi tìm tài liệu:
- Hỏi về ĐIỂM, TIÊU CHÍ CHẤM → dùng doc_type='rubric'
- Hỏi về YÊU CẦU ĐỀ BÀI → dùng doc_type='assignment_brief'
- Hỏi chung hoặc không chắc → không filter doc_type
- Dùng use_hybrid=true khi query chứa keyword cụ thể (tên riêng, con số, thuật ngữ chuyên ngành)
`;
```

---

## Thứ tự implement

Triển khai theo thứ tự này để tránh lỗi dependency:

```
Bước 1: Chạy migration 004 + 005
        (tạo bảng + column mới, RPC functions)

Bước 2: Sửa types/index.ts
        (thêm interfaces mới)

Bước 3: Sửa lib/ai/chunker.ts
        (thêm detectDocType)

Bước 4: Sửa app/api/project/upload-doc/route.ts
        (thêm doc_type khi insert chunks)

Bước 5: Sửa lib/ai/retrieval.ts
        (thêm hybridSearchDocuments + searchReplans)

Bước 6: Tạo lib/ai/replan-memory.ts
        (replan indexing logic)

Bước 7: Sửa lib/ai/tools.ts
        (thêm search_replans, upgrade search_documents)

Bước 8: Sửa lib/ai/execute.ts
        (thêm case cho tools mới)

Bước 9: Sửa agentic loop (route.ts hoặc nơi phân loại read/write)
        (thêm search_replans vào READ_TOOLS)

Bước 10: Sửa commit flow trong route.ts
         (tạo replan_event sau khi commit replan-related tools)

Bước 11: Sửa lib/ai/prompts.ts
         (thêm replan memory + document search instructions vào system prompt)

Bước 12: Test flow hoàn chỉnh
         - Upload đề bài → verify doc_type được detect đúng
         - Hỏi AI về rubric → verify filter doc_type hoạt động
         - Tạo replan → confirm → verify replan_event được index
         - Trigger replan mới → verify AI gọi search_replans và cite precedent
```

---

## Lưu ý khi implement

1. **Không break gì hiện có.** Mọi thay đổi đều là additive — thêm column, thêm table, thêm function. Không sửa signature của function hiện có (match_document_chunks giữ nguyên default params).

2. **Async pattern giữ nguyên.** Embedding + indexing replan vẫn chạy async (IIFE) giống cách hiện tại xử lý document upload. Không block response.

3. **doc_type detection là heuristic.** Sẽ không hoàn hảo. Nhưng kể cả sai thì fallback = 'general', và search không filter = trả về tất cả, nên không gây harm.

4. **Hybrid search là optional upgrade.** Nếu không đủ thời gian, skip hybrid search (Phần 3) và chỉ làm doc_type filter (Phần 2). Vẫn đáng nói trong CV.

5. **Test replan memory cần data.** Tạo 2-3 replan events thủ công (insert vào DB) để test search_replans trước khi test full flow.

6. **Import paths.** Mọi import đều dùng `@/` alias hiện có. Nếu project dùng path khác, adjust accordingly.
