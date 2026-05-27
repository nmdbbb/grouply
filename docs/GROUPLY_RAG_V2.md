# Grouply RAG v2 — Implementation Guide

> Paste file này cho Claude Code hoặc bất kỳ AI agent nào để implement.
> Đọc hết trước khi bắt đầu code.

---

## Triết lý thiết kế

**Một pipeline, nhiều corpus.** Toàn bộ RAG của Grouply chạy trên một table duy nhất (`document_chunks`), một embed model (`all-MiniLM-L6-v2`), và một tool (`search_documents`). Routing được thực hiện qua `doc_type`. AI tự quyết định khi nào cần search và filter gì dựa trên system prompt.

**AI là actor bình thường.** Replan không phải feature đặc biệt — AI đọc project, nhận ra vấn đề, dùng write tools để đề xuất thay đổi, user confirm. Sau khi confirm, hệ thống tự động ghi lại activity vào RAG corpus. Không có trigger riêng, không có replan table.

**Hai corpus:**
- `doc_type = 'project_doc'` — đề bài, rubric, tài liệu tham khảo (đã có)
- `doc_type = 'activity_log'` — lịch sử mọi hành động AI đã thực hiện (cần thêm)

---

## Kiến trúc hiện tại (context)

```
Tech stack: Next.js 16, TypeScript, Supabase (PostgreSQL + pgvector), 
            @xenova/transformers (all-MiniLM-L6-v2, dim=384),
            @anthropic-ai/sdk + groq-sdk, Zustand

Files liên quan:
  lib/ai/tools.ts          — tool definitions (Anthropic format)
  lib/ai/execute.ts        — tool execution server-side
  lib/ai/prompts.ts        — system prompt builder
  lib/ai/context.ts        — build ProjectContext từ Supabase
  lib/ai/chunker.ts        — split text → chunks (500c, overlap 80)
  lib/ai/embed.ts          — embedText(), embedTexts() → number[]
  lib/ai/retrieval.ts      — vector search từ pgvector
  app/api/ai/chat/route.ts — AI endpoint (SSE streaming, agentic loop, commit)
  app/api/project/upload-doc/route.ts — upload + embed documents
  supabase/migrations/     — SQL migrations
  types/index.ts           — TypeScript interfaces
```

### Schema hiện tại (đã có, không sửa)

```sql
CREATE TABLE document_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  document_id   uuid REFERENCES project_documents(id) ON DELETE CASCADE,
  content       text NOT NULL,
  embedding     vector(384) NOT NULL,
  chunk_index   int NOT NULL,
  created_at    timestamptz DEFAULT now()
);
```

### Chunker & embed hiện tại (đã có)

```typescript
// lib/ai/chunker.ts
// chunkText(text: string): Array<{ content: string, chunk_index: number }>
// Chunk size 500c, overlap 80c, break tại \n\n > \n > ". "

// lib/ai/embed.ts
// embedText(text: string): Promise<number[]>
// embedTexts(texts: string[]): Promise<number[][]>
// Singleton pipeline, model cache tại ./.cache/transformers/
```

---

## PHẦN 1 — Migration

Tạo file: `supabase/migrations/004_rag_v2.sql`

```sql
-- =====================================================
-- Migration 004: RAG v2
-- Thêm doc_type, fts, và hybrid search RPC
-- =====================================================

-- 1. Thêm doc_type vào document_chunks
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'project_doc';
-- Giá trị hợp lệ: 'project_doc' | 'activity_log'
-- 'project_doc'  — đề bài, rubric, tài liệu tham khảo
-- 'activity_log' — lịch sử hành động AI đã thực hiện

-- 2. Thêm full-text search column (cho hybrid search)
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
-- Dùng 'simple' thay vì 'english' để handle tiếng Việt tốt hơn

CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
  ON document_chunks USING gin(fts);

-- 3. Thêm metadata column (optional context cho activity_log)
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
-- activity_log dùng: { "action_types": ["assign_tasks_batch"], "timestamp": "..." }
-- project_doc dùng:  { "sub_type": "rubric" | "assignment_brief" | "reference" | "general" }

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
```

---

## PHẦN 2 — Activity Log: tạo virtual document

Activity log không upload từ user — nó được tạo tự động bởi hệ thống sau mỗi commit. Cần một "virtual document" trong `project_documents` để `document_chunks` có thể reference.

### 2.1 Tạo virtual document khi tạo project

Thêm vào logic create project (hoặc là migration seed):

```typescript
// lib/ai/activity-log.ts — TẠO FILE MỚI

import { createClient } from '@/lib/supabase/server';
import { chunkText } from './chunker';
import { embedTexts } from './embed';

const ACTIVITY_LOG_DOC_NAME = '__activity_log__';

/**
 * Lấy hoặc tạo virtual document cho activity log của project.
 * Mỗi project có đúng 1 activity log document.
 */
async function getOrCreateActivityLogDoc(projectId: string): Promise<string> {
  const supabase = await createClient();

  // Check nếu đã có
  const { data: existing } = await supabase
    .from('project_documents')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', ACTIVITY_LOG_DOC_NAME)
    .single();

  if (existing) return existing.id;

  // Tạo mới — path là placeholder, không có file thật
  const { data: created, error } = await supabase
    .from('project_documents')
    .insert({
      project_id: projectId,
      name: ACTIVITY_LOG_DOC_NAME,
      path: `__virtual__/${projectId}/activity_log`,
      url: '',
      file_type: 'text/plain',
    })
    .select('id')
    .single();

  if (error || !created) throw new Error('Failed to create activity log doc');
  return created.id;
}

/**
 * Tạo text summary từ một batch tool calls đã được confirm.
 * Summary này sẽ được embed và index vào document_chunks.
 */
export function buildActivitySummary(
  toolCalls: Array<{ name: string; input: Record<string, any> }>,
  projectContext: {
    memberNames: Record<string, string>; // userId → name
    taskNames: Record<string, string>;   // taskId → name
  }
): string {
  const date = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const lines: string[] = [`[${date}] AI thực hiện ${toolCalls.length} hành động:`];

  for (const tc of toolCalls) {
    switch (tc.name) {
      case 'add_task':
        lines.push(`- Thêm task "${tc.input.name}" vào section "${tc.input.section_name}"` +
          (tc.input.assignee_id ? ` (giao cho ${projectContext.memberNames[tc.input.assignee_id] ?? tc.input.assignee_id})` : ''));
        break;

      case 'update_task': {
        const taskName = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id;
        const changes: string[] = [];
        if (tc.input.status)      changes.push(`status → ${tc.input.status}`);
        if (tc.input.assignee_id) changes.push(`assignee → ${projectContext.memberNames[tc.input.assignee_id] ?? tc.input.assignee_id}`);
        if (tc.input.deadline)    changes.push(`deadline → ${tc.input.deadline}`);
        if (tc.input.name)        changes.push(`tên → "${tc.input.name}"`);
        lines.push(`- Cập nhật task "${taskName}": ${changes.join(', ')}`);
        break;
      }

      case 'delete_task': {
        const taskName = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id;
        lines.push(`- Xóa task "${taskName}"`);
        break;
      }

      case 'assign_tasks_batch':
        for (const a of (tc.input.assignments ?? [])) {
          const taskName = projectContext.taskNames[a.task_id] ?? a.task_id;
          const memberName = projectContext.memberNames[a.assignee_id] ?? a.assignee_id;
          lines.push(`- Giao task "${taskName}" cho ${memberName}`);
        }
        break;

      case 'set_dependency': {
        const t1 = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id;
        const t2 = projectContext.taskNames[tc.input.blocked_by_id] ?? tc.input.blocked_by_id;
        lines.push(`- Đặt "${t1}" phụ thuộc vào "${t2}"`);
        break;
      }

      case 'remove_dependency': {
        const t = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id;
        lines.push(`- Xóa dependency của task "${t}"`);
        break;
      }

      case 'add_section':
        lines.push(`- Thêm section "${tc.input.name}"`);
        break;

      case 'add_checklist_item':
        lines.push(`- Thêm checklist item "${tc.input.name}"`);
        break;

      case 'link_task_to_item': {
        const t = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id;
        lines.push(`- Gắn task "${t}" với checklist item`);
        break;
      }

      default:
        lines.push(`- ${tc.name}: ${JSON.stringify(tc.input).slice(0, 80)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Index một batch activity vào RAG corpus.
 * Gọi async sau khi commit tool calls thành công.
 */
export async function indexActivity(
  projectId: string,
  toolCalls: Array<{ name: string; input: Record<string, any> }>,
  projectContext: {
    memberNames: Record<string, string>;
    taskNames: Record<string, string>;
  }
): Promise<void> {
  const supabase = await createClient();

  // Lấy virtual document id
  const documentId = await getOrCreateActivityLogDoc(projectId);

  // Build summary text
  const summary = buildActivitySummary(toolCalls, projectContext);

  // Chunk (thường là 1 chunk vì summary ngắn)
  const chunks = chunkText(summary);

  // Embed
  const embeddings = await embedTexts(chunks.map(c => c.content));

  // Insert vào document_chunks với doc_type = 'activity_log'
  const rows = chunks.map((chunk, i) => ({
    project_id: projectId,
    document_id: documentId,
    content: chunk.content,
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: i,
    doc_type: 'activity_log',
    metadata: {
      action_types: [...new Set(toolCalls.map(tc => tc.name))],
      timestamp: new Date().toISOString(),
    },
  }));

  const { error } = await supabase.from('document_chunks').insert(rows);
  if (error) console.error('indexActivity error:', error);
  // Không throw — index fail không nên break UI
}
```

---

## PHẦN 3 — Upload Pipeline: thêm doc_type & sub_type

### 3.1 Detect sub_type từ filename + content

Thêm vào `lib/ai/chunker.ts`:

```typescript
/**
 * Detect sub_type cho project_doc từ filename và content.
 * Kết quả được lưu vào metadata.sub_type
 */
export function detectDocSubType(
  filename: string,
  text: string
): 'rubric' | 'assignment_brief' | 'reference' | 'general' {
  const name = filename.toLowerCase();
  const body = text.toLowerCase();

  if (
    name.includes('rubric') ||
    body.includes('tiêu chí chấm') ||
    body.includes('grading criteria') ||
    /\b\d+\s*%\s*.{3,40}(điểm|point|mark)/i.test(text)
  ) return 'rubric';

  if (
    name.includes('đề bài') || name.includes('assignment') || name.includes('brief') ||
    body.includes('yêu cầu bài tập') || body.includes('nộp bài') ||
    body.includes('submission deadline') || body.includes('deliverable')
  ) return 'assignment_brief';

  if (
    name.includes('tài liệu') || name.includes('reference') || name.includes('handbook')
  ) return 'reference';

  return 'general';
}
```

### 3.2 Sửa upload-doc/route.ts

Tìm đoạn async embed pipeline và sửa:

```typescript
// Thêm import
import { detectDocSubType } from '@/lib/ai/chunker';

// Trong async IIFE sau khi upload thành công:
const subType = detectDocSubType(filename, extractedText);
const chunks = chunkText(extractedText);
const embeddings = await embedTexts(chunks.map(c => c.content));

const rows = chunks.map((chunk, i) => ({
  project_id: projectId,
  document_id: documentId,   // id vừa insert vào project_documents
  content: chunk.content,
  embedding: JSON.stringify(embeddings[i]),
  chunk_index: i,
  doc_type: 'project_doc',   // ← THÊM
  metadata: { sub_type: subType },  // ← THÊM
}));

await supabase.from('document_chunks').insert(rows);
```

---

## PHẦN 4 — Retrieval: thêm hybrid search

Thêm vào `lib/ai/retrieval.ts` (giữ nguyên function hiện có, thêm mới bên dưới):

```typescript
import { embedText } from './embed';
import { createClient } from '@/lib/supabase/server';

/**
 * Hybrid search: kết hợp vector similarity + full-text search.
 * Dùng khi query chứa keyword cụ thể (tên riêng, con số, thuật ngữ).
 */
export async function hybridSearchChunks(
  query: string,
  projectId: string,
  options?: {
    matchCount?: number;
    docType?: 'project_doc' | 'activity_log' | null;
    vectorWeight?: number;
    textWeight?: number;
  }
): Promise<Array<{
  content: string;
  document_name: string;
  chunk_index: number;
  combined_score: number;
  doc_type: string;
  metadata: Record<string, any>;
}>> {
  const supabase = await createClient();
  const embedding = await embedText(query);

  const { data, error } = await supabase.rpc('hybrid_search_chunks', {
    query_embedding: JSON.stringify(embedding),
    query_text: query,
    match_project_id: projectId,
    match_count: options?.matchCount ?? 5,
    filter_doc_type: options?.docType ?? null,
    vector_weight: options?.vectorWeight ?? 0.7,
    text_weight: options?.textWeight ?? 0.3,
  });

  if (error) {
    console.error('hybridSearchChunks error:', error);
    return [];
  }
  return data ?? [];
}
```

---

## PHẦN 5 — Tool: upgrade search_documents

### 5.1 Sửa tools.ts

Tìm tool `search_documents` hiện tại và **thay toàn bộ** bằng:

```typescript
{
  name: 'search_documents',
  description: `Tìm kiếm ngữ nghĩa trong tài liệu và lịch sử hoạt động của dự án.

Hai corpus:
- doc_type="project_doc": đề bài, rubric, tài liệu tham khảo (file đã upload)
- doc_type="activity_log": lịch sử mọi hành động AI đã thực hiện trong dự án

Khi nào dùng:
- Hỏi về yêu cầu đề bài, tiêu chí chấm → doc_type="project_doc"
- Hỏi lịch sử ("AI đã làm gì?", "tại sao task này assign cho X?") → doc_type="activity_log"
- Hỏi chung không chắc loại → bỏ trống doc_type
- Query có keyword cụ thể (tên người, con số, thuật ngữ) → use_hybrid=true`,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Câu truy vấn tìm kiếm',
      },
      doc_type: {
        type: 'string',
        enum: ['project_doc', 'activity_log'],
        description: 'Filter theo corpus. Bỏ trống để tìm cả hai.',
      },
      use_hybrid: {
        type: 'boolean',
        description: 'Bật hybrid search (vector + keyword). Default false.',
        default: false,
      },
      match_count: {
        type: 'number',
        description: 'Số kết quả (default 5)',
        default: 5,
      },
    },
    required: ['query'],
  },
},
```

### 5.2 Sửa execute.ts

Tìm case `'search_documents'` và **thay toàn bộ**:

```typescript
case 'search_documents': {
  const { query, doc_type, use_hybrid = false, match_count = 5 } = toolInput;

  let results: Array<{
    content: string;
    document_name: string;
    chunk_index: number;
    similarity?: number;
    combined_score?: number;
    doc_type: string;
    metadata: Record<string, any>;
  }>;

  if (use_hybrid) {
    results = await hybridSearchChunks(query, projectId, {
      matchCount: match_count,
      docType: doc_type ?? null,
    });
  } else {
    // Dùng existing match_document_chunks với doc_type filter
    const supabase = await createClient();
    const embedding = await embedText(query);
    const { data } = await supabase.rpc('match_document_chunks', {
      query_embedding: JSON.stringify(embedding),
      match_project_id: projectId,
      match_count,
      filter_doc_type: doc_type ?? null,
    });
    results = data ?? [];
  }

  if (!results.length) {
    return {
      result: doc_type === 'activity_log'
        ? 'Chưa có lịch sử hoạt động nào được ghi lại.'
        : 'Không tìm thấy nội dung liên quan trong tài liệu.',
    };
  }

  const score = (r: typeof results[0]) =>
    ((r.combined_score ?? r.similarity ?? 0) * 100).toFixed(0);

  const label = (r: typeof results[0]) =>
    r.doc_type === 'activity_log'
      ? `[activity_log]`
      : `[${r.metadata?.sub_type ?? 'project_doc'}] ${r.document_name}`;

  const formatted = results
    .map((r, i) => `[${i + 1}] ${label(r)} (score: ${score(r)}%)\n${r.content}`)
    .join('\n---\n');

  return { result: formatted };
}
```

---

## PHẦN 6 — Commit Flow: auto-index activity

### 6.1 Sửa app/api/ai/chat/route.ts

Tìm đoạn xử lý `commit_tool_calls` và thêm indexing sau khi execute thành công:

```typescript
// Thêm import
import { indexActivity } from '@/lib/ai/activity-log';

// Trong commit path, SAU KHI executeToolCalls() thành công:

// Build lookup maps từ projectContext (đã có trong scope)
const memberNames = Object.fromEntries(
  projectContext.members.map((m: any) => [m.id, m.name])
);
const taskNames = Object.fromEntries(
  (projectContext.tasks ?? []).map((t: any) => [t.id, t.name])
);

// Async index — không block response
indexActivity(projectId, commitToolCalls, { memberNames, taskNames })
  .catch(err => console.error('indexActivity failed:', err));

// Response như bình thường
return NextResponse.json({ executed: true, results });
```

---

## PHẦN 7 — System Prompt

### 7.1 Sửa lib/ai/prompts.ts

Thêm đoạn sau vào `buildSystemPrompt()`, trong phần tool rules:

```typescript
const ragRules = `
## Khi nào gọi search_documents
Gọi search_documents khi:
- Người dùng hỏi về nội dung đề bài, yêu cầu, rubric, tiêu chí chấm điểm
  → dùng doc_type="project_doc"
- Người dùng hỏi về lịch sử: "AI đã làm gì?", "tại sao task X assign cho Y?",
  "trước đây nhóm đã điều chỉnh gì?"
  → dùng doc_type="activity_log"
- Query chứa tên người, con số, thuật ngữ cụ thể → thêm use_hybrid=true

Khi đề xuất thay đổi (replan, điều chỉnh task, phân công lại):
1. Gọi read_project để nắm trạng thái hiện tại
2. Gọi search_documents với doc_type="activity_log" để xem lịch sử
3. Đề xuất dựa trên cả hai nguồn
4. Nếu có precedent từ activity_log, cite: "Trước đây nhóm đã..."
`;
```

---

## Thứ tự implement

```
1. Chạy migration 004_rag_v2.sql

2. Sửa lib/ai/chunker.ts
   → thêm detectDocSubType()

3. Sửa app/api/project/upload-doc/route.ts
   → thêm doc_type='project_doc' và metadata.sub_type khi insert chunks

4. Thêm lib/ai/activity-log.ts
   → file mới hoàn toàn

5. Sửa lib/ai/retrieval.ts
   → thêm hybridSearchChunks()

6. Sửa lib/ai/tools.ts
   → thay search_documents definition

7. Sửa lib/ai/execute.ts
   → thay case 'search_documents'

8. Sửa app/api/ai/chat/route.ts
   → thêm indexActivity() call sau commit

9. Sửa lib/ai/prompts.ts
   → thêm RAG rules vào system prompt

10. Test
    a. Upload đề bài → verify doc_type='project_doc', metadata.sub_type đúng
    b. Hỏi AI về rubric → verify trả về project_doc chunks
    c. Dùng AI commit một vài tool calls
    d. Hỏi "AI đã làm gì?" → verify trả về activity_log chunks
    e. Dùng AI đề xuất thay đổi → verify AI cite lịch sử
```

---

## Lưu ý

**Không break gì hiện có.**
- `match_document_chunks` giữ nguyên signature cũ, chỉ thêm optional params với default NULL
- Chunks cũ (không có doc_type) tự nhận DEFAULT `'project_doc'` — hoạt động đúng ngay

**`document_name` cho activity_log là `'__activity_log__'`.**
Execute.ts đã handle bằng cách check `doc_type` trước khi format label — không hiển thị tên xấu ra user.

**indexActivity không throw.**
Log fail không nên crash commit flow. Dùng `.catch(console.error)` là đủ.

**Virtual document path.**
`project_documents.path` = `__virtual__/{projectId}/activity_log` — không có file thật trong Storage. Nếu code nào try download path này sẽ lỗi 404. Kiểm tra trước khi ship nếu có logic đọc file từ Storage dựa vào path.
