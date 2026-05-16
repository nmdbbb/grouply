# Grouply — Kiến trúc hệ thống

> Tài liệu này mô tả toàn bộ kiến trúc kỹ thuật của Grouply: cấu trúc file, luồng dữ liệu, hệ thống AI, database schema, và các quyết định thiết kế quan trọng.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Tech Stack](#2-tech-stack)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Database Schema](#4-database-schema)
5. [Luồng dữ liệu chính](#5-luồng-dữ-liệu-chính)
6. [Hệ thống AI](#6-hệ-thống-ai)
7. [RAG System](#7-rag-system)
8. [State Management](#8-state-management)
9. [Realtime & Subscriptions](#9-realtime--subscriptions)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [API Routes](#11-api-routes)
12. [Component Architecture](#12-component-architecture)
13. [Quyết định thiết kế](#13-quyết-định-thiết-kế)

---

## 1. Tổng quan

Grouply là ứng dụng quản lý dự án nhóm cho sinh viên, tích hợp AI assistant. Điểm đặc trưng:

- **Task graph**: Visualize tasks như một đồ thị có hướng (dependency, section grouping)
- **AI assistant**: Agentic loop — AI tự đọc project data, đề xuất và thực thi thay đổi
- **RAG**: AI đọc đề bài/tài liệu upload để trả lời câu hỏi ngữ nghĩa
- **Role-based**: Owner quản lý, member tự nhận việc
- **Realtime**: Tasks và checklist cập nhật live qua Supabase

```
┌─────────────────────────────────────────────────────────────────┐
│                         GROUPLY                                 │
│                                                                 │
│   Browser                    Server                 Supabase   │
│  ┌─────────┐               ┌─────────┐            ┌─────────┐  │
│  │WorkspaceClient           │ Next.js │            │Postgres │  │
│  │ ├ TaskGraph              │ App     │◄──────────►│+ pgvec  │  │
│  │ ├ ChatPanel              │ Router  │            │+ Auth   │  │
│  │ ├ ChecklistSidebar       │         │            │+ Storage│  │
│  │ ├ TimelineView           │ API     │            │+ RT     │  │
│  │ └ DocumentsTab           │ Routes  │            └─────────┘  │
│  └─────────┘               └────┬────┘                         │
│       │ SSE stream               │                             │
│       │ Zustand stores           │ Anthropic / Groq API        │
│       └──────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Công nghệ | Mục đích |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | Server components, API routes, SSR |
| Language | TypeScript | Type safety toàn codebase |
| Database | Supabase (PostgreSQL) | Data, Auth, Storage, Realtime |
| Vector DB | pgvector (Supabase) | Embedding search cho RAG |
| AI — Claude | `@anthropic-ai/sdk` | Primary AI provider |
| AI — Groq | `groq-sdk` | Free alternative (Llama 3.3 70B) |
| Embedding | `@xenova/transformers` | Local embedding, không cần API key |
| State | Zustand | Client-side state (chat, graph) |
| Graph UI | `@xyflow/react` + `dagre` | Task graph visualization |
| Styling | Tailwind CSS + shadcn/ui | UI components |
| Doc parse | `pdf-parse`, `mammoth` | Extract text từ PDF/DOCX |

---

## 3. Cấu trúc thư mục

```
grouply/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Route group — không cần layout chính
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── api/                      # API Routes (server-only)
│   │   ├── ai/chat/route.ts      # ⭐ Core AI endpoint (SSE streaming)
│   │   └── project/
│   │       ├── create/route.ts
│   │       ├── delete/route.ts
│   │       ├── upload-doc/route.ts   # Upload + embed documents
│   │       ├── extract-doc/route.ts  # Extract text từ file
│   │       └── delete-doc/route.ts
│   ├── dashboard/page.tsx        # Server component — list projects
│   ├── invite/[token]/page.tsx   # Join project via invite link
│   ├── project/
│   │   ├── [id]/page.tsx         # ⭐ Workspace entry point (Server)
│   │   └── new/page.tsx          # Create project form
│   └── settings/page.tsx         # User settings (BYOK key)
│
├── components/
│   ├── auth/                     # RegisterForm, LoginForm
│   ├── chat/                     # ⭐ AI Chat system
│   │   ├── ChatPanel.tsx         # Main chat UI + SSE reader
│   │   ├── Message.tsx           # Tin nhắn + reply quote + attachment badge
│   │   ├── ActionPreviewCard.tsx # Preview write tools, nút Commit/Discard
│   │   ├── SimulateModal.tsx     # Simulate mode — copy/paste với Claude.ai
│   │   ├── FileAttachButton.tsx  # Upload file, extract text
│   │   └── ReplyBar.tsx          # Reply quote bar
│   ├── checklist/
│   │   └── ChecklistSidebar.tsx  # Sidebar trái — checklist progress + realtime
│   ├── contribution/
│   │   └── ContributionBar.tsx   # Bottom bar — đóng góp từng thành viên
│   ├── documents/
│   │   └── DocumentsTab.tsx      # Upload, list, analyze documents
│   ├── graph/                    # ⭐ Task Graph
│   │   ├── TaskGraph.tsx         # ReactFlow canvas + realtime subscription
│   │   ├── GraphToolbar.tsx      # Toolbar (Add task, Add section, Layout)
│   │   ├── nodes/
│   │   │   ├── TaskNode.tsx      # Node task (drag, status, assign)
│   │   │   ├── SectionNode.tsx   # Container node cho section
│   │   │   └── GhostTaskNode.tsx # Preview node khi AI đề xuất task mới
│   │   └── edges/
│   │       └── DependencyEdge.tsx # Cạnh dependency có nút xóa
│   ├── project/
│   │   ├── CreateProjectForm.tsx
│   │   ├── InviteButton.tsx
│   │   └── ProjectCard.tsx
│   ├── task/
│   │   ├── TaskDrawer.tsx        # Panel chi tiết task (history, claims, docs)
│   │   ├── TaskList.tsx          # List view với filter "Tất cả / Của tôi"
│   │   ├── ActivityLog.tsx       # Lịch sử thay đổi task
│   │   ├── ClaimBadge.tsx        # Badge ai đã claim task
│   │   └── StatusBadge.tsx
│   ├── timeline/
│   │   └── TimelineView.tsx      # Gantt SVG chart
│   └── ui/                       # shadcn/ui + custom primitives
│       └── ResizableDivider.tsx  # VSCode-style panel resize
│
├── lib/
│   ├── ai/                       # ⭐ AI System
│   │   ├── tools.ts              # Tool definitions (Anthropic format)
│   │   ├── execute.ts            # Tool execution (server-side)
│   │   ├── prompts.ts            # System prompt builder
│   │   ├── context.ts            # Build ProjectContext từ Supabase
│   │   ├── groq.ts               # Groq agentic loop (streaming)
│   │   ├── simulate.ts           # Simulate mode prompt/parse
│   │   ├── preview.ts            # GhostPreview từ ToolCall[]
│   │   ├── ghostBuilder.ts       # Ghost nodes cho graph preview
│   │   ├── chunker.ts            # Split text thành chunks cho RAG
│   │   ├── embed.ts              # Local embedding (Transformers.js)
│   │   └── retrieval.ts          # Vector search từ Supabase pgvector
│   └── supabase/
│       ├── client.ts             # Browser Supabase client
│       └── server.ts             # Server Supabase client (cookie-based)
│
├── stores/                       # Zustand global state
│   ├── chatStore.ts              # Messages, streaming, pending tools, provider
│   └── graphStore.ts             # Nodes, edges, ghost preview
│
├── types/
│   └── index.ts                  # Tất cả TypeScript interfaces
│
└── supabase/
    └── migrations/
        ├── 001_init.sql          # Core schema (11 tables, RLS, triggers)
        ├── 002_project_documents.sql  # Documents table + storage bucket
        └── 003_document_chunks.sql   # pgvector chunks cho RAG
```

---

## 4. Database Schema

### Diagram quan hệ

```
profiles ◄─────────── project_members ───────────► projects
    │                       │                          │
    │                  (owner/member)                  │
    │                                          ┌───────┴────────┐
    │                                          │                │
    │                                       sections      checklist_items
    │                                          │                │
    │                                          └────────► tasks ◄┘
    │                                                     │
    ├─────────────── task_claims                          │
    ├─────────────── task_history               ┌─────────┴──────────┐
    └─────────────── task_documents      project_documents    document_chunks
                                                             (pgvector)
```

### Tables chính

**`profiles`** — mở rộng từ `auth.users`
```sql
id uuid PRIMARY KEY  -- = auth.users.id
name text
avatar_url text
byok_key text        -- Base64-encoded Anthropic API key (BYOK)
```

**`projects`**
```sql
id, name, subject, description, deadline, owner_id → profiles
```

**`project_members`** — many-to-many profiles ↔ projects
```sql
project_id, user_id, role ('owner'|'member')
```

**`sections`** — nhóm visual cho tasks
```sql
project_id, name, color (hex), ord (thứ tự)
```

**`checklist_items`** — deliverables của project
```sql
project_id, name, description, ord
```

**`tasks`** — entity trung tâm
```sql
project_id, section_id, checklist_item_id
name, description, status, type
assignee_id → profiles
blocked_by_id → tasks (self-referential dependency)
deadline, is_optional
pos_x, pos_y  -- vị trí trên graph canvas
created_by → profiles
```

**`task_claims`** — member đăng ký nhận task
```sql
task_id, user_id
```

**`task_history`** — audit trail
```sql
task_id, user_id, action, old_value (jsonb), new_value (jsonb)
```

**`task_documents`** — file đính kèm vào task
```sql
task_id, url, name, created_by
```

**`project_documents`** — tài liệu upload lên project
```sql
project_id, name, path (storage path), url, file_type, uploaded_by
```

**`document_chunks`** — chunks cho RAG
```sql
project_id, document_id, content, embedding vector(384), chunk_index
```

### Helper functions (PL/pgSQL)

```sql
is_project_member(project_id uuid) → boolean
is_project_owner(project_id uuid) → boolean
match_document_chunks(query_embedding, match_project_id, match_count) → table
```

### Row Level Security

Mọi table đều có RLS. Quy tắc chung:
- `SELECT`: thành viên của project mới đọc được
- `INSERT/UPDATE`: thành viên của project
- `DELETE`: owner hoặc người tạo record

---

## 5. Luồng dữ liệu chính

### 5.1 Load workspace

```
Browser: GET /project/[id]
  → app/project/[id]/page.tsx (Server Component)
  → Supabase auth check → redirect nếu chưa login
  → Parallel fetch: project, sections, tasks, members, checklistItems, profile
  → buildProjectContext() → ProjectContext cho AI
  → Render WorkspaceClient với initialData
```

WorkspaceClient giữ `liveSections` và `liveTasks` state — cập nhật qua `reloadData()` sau mỗi AI commit.

### 5.2 Gửi tin nhắn AI

```
User nhập → ChatPanel.handleSend()
  → addMessage({ role: 'user', ... }) vào chatStore
  → POST /api/ai/chat {
      project_id, message,
      conversation_history (12 msgs gần nhất),
      reply_to?, attached_text?, provider
    }
  → Server: buildProjectContext() + buildSystemPrompt()
  → Agentic loop (Anthropic hoặc Groq)
  → ReadableStream SSE → client reader
  → Từng event: text_delta | tool_running | write_tools | done | error
```

### 5.3 Agentic loop (server)

```
Vòng lặp tối đa 8 iterations:

  Gọi AI với messages[]
    ↓
  AI trả về text blocks + tool_use blocks
    ↓
  Stream text ngay → client (text_delta)
    ↓
  Phân loại tool calls:
    ├── Read tools  → executeToolCall() → feed result lại → vòng tiếp
    └── Write tools → dừng → gửi write_tools event → chờ user confirm
```

### 5.4 Commit tool calls

```
User nhấn "Commit" trong ActionPreviewCard
  → POST /api/ai/chat { commit_tool_calls: ToolCall[] }
  → executeToolCalls() (sequential: section trước, task sau)
  → Cache section_id trong batch
  → Return results
  → WorkspaceClient.reloadData()
  → clearGhost() + clearPending()
```

---

## 6. Hệ thống AI

### 6.1 Tools

Tất cả tools định nghĩa trong `lib/ai/tools.ts` theo Anthropic format (`input_schema`). Groq adapter tự convert sang OpenAI format (`parameters`).

**Read tools** (auto-execute trong agentic loop):

| Tool | Mô tả |
|------|-------|
| `search_documents` | Semantic search tài liệu qua pgvector |
| `read_project` | Toàn bộ tasks, members, sections, checklist |
| `read_task` | Chi tiết 1 task (có project_id scope) |
| `read_member_load` | Workload từng thành viên |
| `read_tasks_by_section` | Tasks filter theo section/status |

**Write tools** (dừng loop, chờ user confirm):

| Tool | Mô tả |
|------|-------|
| `add_task` | Thêm task, auto-resolve section name→id, auto-position |
| `update_task` | Cập nhật bất kỳ fields nào |
| `delete_task` | Xóa task (owner only) |
| `add_section` | Tạo section với màu tự động |
| `add_checklist_item` | Thêm deliverable |
| `link_task_to_item` | Gắn task với checklist item |
| `set_dependency` | Task A blocked by Task B |
| `remove_dependency` | Xóa dependency |
| `assign_tasks_batch` | Phân công hàng loạt `[{task_id, assignee_id}]` |

### 6.2 System Prompt

`buildSystemPrompt(context, currentUserName, currentUserRole, currentUserId, mode)`

Cấu trúc prompt:
```
1. Project info: tên, môn học, deadline, hôm nay, số ngày còn lại
2. Members list: name + id (để AI dùng khi gọi tool)
3. Người dùng hiện tại: name, id, role
4. Checklist status: icon ✓/◑/□, số task done/total
5. Tool usage rules: khi nào gọi tool nào
6. Assignment rules: owner vs member
7. Permission rules: ai được delete, update
```

**Lazy context**: Không inject danh sách tasks vào prompt (~2000 tokens tiết kiệm mỗi request). AI tự gọi `read_project` hoặc `read_tasks_by_section` khi cần.

### 6.3 Hai providers

**Anthropic (Claude Sonnet)**
- Model: `claude-sonnet-4-20250514`
- Format: Anthropic native (`input_schema`, `tool_use` blocks)
- Text: fake-stream bằng chunk 50 ký tự

**Groq (Llama 3.3 70B)** — `lib/ai/groq.ts`
- Model: `llama-3.3-70b-versatile` (free tier)
- Format: OpenAI-compatible (convert `input_schema` → `parameters`)
- True streaming: `for await (chunk of stream)`, mỗi `delta.content` gửi ngay
- Tool assembly: tích lũy `arguments` string qua `toolCallMap[index]`, parse JSON sau khi stream xong

### 6.4 Simulate Mode

Khi `mode === 'simulate'`:
- `buildSimulatePrompt()` tạo full prompt text (system + history + message + tool descriptions)
- Mở `SimulateModal` — user copy prompt sang Claude.ai, copy response về
- `parseSimulateResponse()` parse tool calls từ 3 format: `<tool_calls>`, JSON array, ` ```json` `
- Feed vào cùng flow commit với API mode

### 6.5 SSE Event Format

```typescript
{ type: 'text_delta',   text: string }          // streaming text
{ type: 'tool_running', tool: string }           // đang execute read tool
{ type: 'write_tools',  tool_calls: ToolCall[], preview: GhostPreview }
{ type: 'done' }
{ type: 'error',        message: string }
```

---

## 7. RAG System

### 7.1 Kiến trúc

```
Upload document
  → extract text (pdf-parse / mammoth / utf-8)
  → chunker.ts: split thành chunks 500 ký tự, overlap 80
  → embed.ts: Transformers.js (all-MiniLM-L6-v2, dim=384, local)
  → insert document_chunks[] vào Supabase (async, không block response)

User hỏi → AI gọi search_documents(query)
  → retrieval.ts: embed query → match_document_chunks RPC (cosine similarity)
  → trả về top-5 chunks với document_name + similarity score
  → AI đọc chunks → trả lời dựa trên nội dung thực
```

### 7.2 Chunking strategy

- **Chunk size**: 500 ký tự — đủ nhỏ cho embed model, đủ lớn để có ngữ nghĩa
- **Overlap**: 80 ký tự — tránh mất context tại ranh giới chunk
- **Break points**: ưu tiên cắt tại `\n\n` > `\n` > `. ` > `! ` > `? ` > ` `
- **Filter**: bỏ chunks < 20 ký tự

### 7.3 Embedding model

`Xenova/all-MiniLM-L6-v2` chạy local trong Node.js qua Transformers.js:
- Dimension: 384 (khớp với `vector(384)` trong Supabase)
- Singleton pipeline — tải model 1 lần, cache trong memory
- Model cache: `./.cache/transformers/` (tải về lần đầu ~20MB)
- Không cần API key ngoài

### 7.4 Vector search SQL

```sql
SELECT dc.content, pd.name AS document_name, dc.chunk_index,
       1 - (dc.embedding <=> query_embedding) AS similarity
FROM document_chunks dc
JOIN project_documents pd ON pd.id = dc.document_id
WHERE dc.project_id = match_project_id
ORDER BY dc.embedding <=> query_embedding  -- cosine distance
LIMIT match_count;
```

---

## 8. State Management

### chatStore (Zustand)

```typescript
// Data
messages: ChatMessage[]        // Lịch sử hội thoại
streamingContent: string       // Text đang stream realtime
pendingToolCalls: ToolCall[]   // Write tools chờ user confirm
ghostPreview: GhostPreview     // Mô tả thay đổi sẽ thực hiện

// UI state
mode: 'api' | 'simulate'
provider: 'anthropic' | 'groq'
loading: boolean
replyTo: ChatMessage | null
attachedFile: { name, text } | null

// Key actions
updateStreamingContent(delta)  // Cộng dồn text từ SSE
flushStreaming()               // Push streamingContent → messages[]
setPending(toolCalls, preview) // Set write tools chờ confirm
```

**Pattern streaming**: `streamingContent` accumulate từng delta, hiển thị live với cursor `animate-pulse`. Khi `done` hoặc `write_tools` event → `flushStreaming()` push thành message cố định.

### graphStore (Zustand)

```typescript
nodes: Node[]        // Section nodes + Task nodes
edges: Edge[]        // Dependency edges
ghostNodes: Node[]   // Preview nodes (add_task AI đề xuất)
ghostEdges: Edge[]

buildFromData(tasks, sections, members, ...) // Rebuild toàn bộ graph
updateTaskNode(task)  // Cập nhật 1 node sau khi edit
removeTaskNode(id)    // Xóa node
setGhostPreview(...)  // Hiển thị ghost nodes
clearGhost()          // Xóa ghost sau commit/discard
```

**Node structure**:
- `sectionNode`: width=300, height dynamic theo số tasks, backgroundColor = section.color + '80'
- `taskNode`: parentId = `section-${section_id}` → drag trong section container
- `ghostTaskNode`: node mờ, không có drag handlers

---

## 9. Realtime & Subscriptions

Supabase Realtime (PostgreSQL changes) được subscribe tại 2 điểm:

**`TaskGraph.tsx`** — subscribe `tasks` table:
```typescript
supabase.channel(`tasks-${projectId}`)
  .on('postgres_changes', { event: '*', table: 'tasks', filter: `project_id=eq.${projectId}` }, ...)
```
Nhận INSERT/UPDATE/DELETE → cập nhật graph node tương ứng mà không reload toàn bộ.

**`ChecklistSidebar.tsx`** — subscribe cả `tasks` và `checklist_items`:
```typescript
.on('postgres_changes', { table: 'tasks', ... }, async () => reload tasks)
.on('postgres_changes', { table: 'checklist_items', ... }, async () => reload items)
```
Cập nhật status icon (□/◑/✓) realtime khi tasks thay đổi.

---

## 10. Authentication & Authorization

### Flow đăng nhập

```
Register → Supabase Auth (email/password)
         → Trigger auto-insert profiles row
         → Redirect /dashboard
Login    → Supabase session cookie (SSR-safe)
         → middleware.ts validate session (đã xóa — dùng per-route check)
```

### Per-route authorization

Mỗi server component và API route tự check:
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')  // hoặc return 401

const { data: membership } = await supabase
  .from('project_members')
  .select('role')
  .eq('project_id', projectId)
  .eq('user_id', user.id)
  .single()
if (!membership) redirect('/dashboard')  // hoặc return 403
```

### BYOK (Bring Your Own Key)

User có thể lưu Anthropic API key cá nhân trong settings:
- Key được encode Base64 trước khi lưu vào `profiles.byok_key`
- Tại `/api/ai/chat`: decode và dùng thay cho server key
- Groq key hiện dùng server key (`GROQ_API_KEY` trong env)

---

## 11. API Routes

### `POST /api/ai/chat`

Endpoint trung tâm của hệ thống AI.

**Request body:**
```typescript
{
  project_id: string
  message: string
  conversation_history?: { role, content }[]  // Trimmed to last 12
  commit_tool_calls?: ToolCall[]               // Nếu có → execute trực tiếp
  attached_text?: string                        // Text từ file đính kèm
  reply_to?: string                             // Nội dung tin nhắn reply
  provider?: 'anthropic' | 'groq'              // Default: 'anthropic'
}
```

**Response:**
- Commit path: `{ executed: true, results: ToolResult[] }`
- Stream path: `text/event-stream` SSE

**Flow:**
```
1. Auth check (user) + membership check
2. Resolve API key (BYOK > env)
3. buildProjectContext() + buildSystemPrompt()
4. Inject reply_to, attached_text vào userContent
5. Trim history to last 12 messages
6. Route to Groq hoặc Anthropic agentic loop
7. Stream SSE events
```

### `POST /api/project/upload-doc`

Upload file lên Supabase Storage + trigger embed pipeline.

```
Validate (member check, ext, size ≤10MB)
→ Upload to storage: project-docs/{projectId}/{timestamp}-{filename}
→ Insert project_documents record
→ Extract text (pdf-parse / mammoth / utf-8)
→ (async) chunk → embed → insert document_chunks
→ Return { path, name, url } ngay (không chờ embed)
```

### `POST /api/project/extract-doc`

Extract text từ file đã upload (dùng cho "Phân tích" button trong DocumentsTab).

```
Download file từ Storage
→ Extract text (PDF/DOCX/TXT)
→ Truncate 8000 ký tự
→ Return { text, truncated }
```

---

## 12. Component Architecture

### WorkspaceClient — layout chính

```
┌──────────────────────────────────────────────────────────┐
│ Header: Grouply / ProjectName | Tab switcher | Actions   │
├────────────┬─────────────────────────────┬───────────────┤
│ Checklist  │  Main Content Area          │  ChatPanel    │
│ Sidebar    │  (graph / list / timeline   │               │
│ (resizable)│   / docs)                   │  (resizable)  │
│            │                             │               │
├────────────┴─────────────────────────────┴───────────────┤
│ ContributionBar                                          │
└──────────────────────────────────────────────────────────┘
```

- Sidebar width: 240px default, range 160-480px
- Chat width: 320px default, range 240-600px
- `ResizableDivider`: drag handler với `window.addEventListener('mousemove')`
- Sidebar collapse → shrink to 32px, divider ẩn

### Views (tab switcher)

| View | Component | Mô tả |
|------|-----------|-------|
| `graph` | `TaskGraph` | ReactFlow canvas, drag tasks, dependency edges |
| `list` | `TaskList` | Danh sách có filter "Tất cả / Của tôi" |
| `timeline` | `TimelineView` | Gantt chart SVG, zoom 28-80px/day |
| `docs` | `DocumentsTab` | Upload, view, analyze documents |

Chỉ graph và docs view hiển thị ChatPanel.

### TaskGraph — graph canvas

```
ReactFlow
├── nodeTypes: { taskNode, ghostTaskNode, sectionNode }
└── edgeTypes: { dependencyEdge }

Supabase Realtime subscription:
  INSERT task → addNode()
  UPDATE task → updateTaskNode()
  DELETE task → removeTaskNode()

Ghost nodes: hiển thị mờ khi AI đề xuất add_task
  → clearGhost() sau commit hoặc discard
```

### ChatPanel — chat UI

```
Header: [Claude|Groq toggle] ........... [API|Simulate toggle]
────────────────────────────────────────────────────────────
Messages list
  ├── Message (role=user): text + replyTo quote + attachmentName badge
  ├── Message (role=assistant): markdown + hover reply button
  ├── Streaming bubble: streamingContent + animate-pulse cursor
  ├── ActionPreviewCard: write tools pending confirm
  └── "Đang suy nghĩ..." spinner (loading && !streamingContent)
────────────────────────────────────────────────────────────
ReplyBar (nếu có replyTo)
File badge (nếu có attachedFile)
────────────────────────────────────────────────────────────
Input area: [📎 FileAttach] [Textarea] [Gửi]
```

---

## 13. Quyết định thiết kế

### Lazy context loading
**Quyết định**: Không inject task list vào system prompt.
**Lý do**: ~2000 tokens tiết kiệm mỗi request. AI đọc khi cần qua tools.
**Đánh đổi**: Thêm 1 round-trip (read_project call) cho câu hỏi về tasks.

### Tool-based RAG (không inject chunks vào prompt)
**Quyết định**: `search_documents` là tool — AI tự gọi khi cần.
**Lý do**: Không bloat system prompt với chunks không liên quan. AI quyết định khi nào cần đọc tài liệu.
**Đánh đổi**: Thêm 1 agentic loop iteration cho câu hỏi về tài liệu.

### Local embedding (Transformers.js)
**Quyết định**: Dùng `all-MiniLM-L6-v2` chạy trong Node.js server.
**Lý do**: Không cần API key ngoài, free hoàn toàn, Groq không có embedding API.
**Đánh đổi**: Lần đầu load model chậm (~2s), cần ~20MB cache. Singleton pattern giải quyết vấn đề load.

### Sequential tool execution
**Quyết định**: `executeToolCalls()` chạy tuần tự (section trước, task sau).
**Lý do**: `add_task` cần `section_id` — nếu AI tạo section và task cùng batch, section phải tạo trước để có UUID.
**Giải pháp**: Cache `sectionNameToId` trong loop, inject `section_id` vào `add_task` call kế tiếp.

### Sliding window history
**Quyết định**: Chỉ giữ 12 messages gần nhất (6 turns) trong conversation_history.
**Lý do**: Bound token cost — context dài không cải thiện nhiều chất lượng trong task management.

### SSE thay vì WebSocket
**Quyết định**: Server-Sent Events cho AI streaming.
**Lý do**: One-directional stream đủ dùng, đơn giản hơn WebSocket, tương thích Next.js App Router.

### Ghost nodes
**Quyết định**: Hiển thị preview tasks mờ trên graph trước khi commit.
**Lý do**: UX — user thấy layout sẽ trông như thế nào trước khi đồng ý.
**Giới hạn**: Ghost nodes không có section placement chính xác vì section UUID chưa tồn tại.

### Embed async (không block upload)
**Quyết định**: Chunk + embed chạy trong IIFE async sau khi upload response trả về.
**Lý do**: Embedding mất 1-5s tùy file size — không nên để user chờ.
**Đánh đổi**: Nếu server crash giữa chừng, chunks có thể không được lưu. Acceptable vì user có thể upload lại.
