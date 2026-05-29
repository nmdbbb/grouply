# Grouply

Ứng dụng quản lý dự án nhóm cho sinh viên, tích hợp AI assistant hiểu ngữ cảnh dự án — lên kế hoạch, phân công, theo dõi tiến độ qua hội thoại tự nhiên.

## Tính năng

- **Workspace đa chế độ** — xem tasks theo danh sách, graph phụ thuộc, timeline Gantt, và tài liệu
- **AI assistant** — chat với nhiều AI providers để tạo task, phân công, tìm kiếm tài liệu, đọc tiến độ
- **RAG trên tài liệu nhóm** — upload đề bài, rubric, tài liệu tham khảo; AI tìm kiếm semantic khi trả lời
- **Real-time sync** — cập nhật tasks và sections tức thì qua Supabase subscriptions
- **Checklist deliverables** — liên kết tasks với các mục bàn giao; theo dõi % hoàn thành
- **Dependency graph** — visualize task blocking với React Flow
- **Phân quyền owner/member** — owner có toàn quyền, member không xóa được task của người khác
- **BYOK** — dùng API key riêng của nhóm cho các AI provider

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS, shadcn/ui, Lucide |
| AI | Vercel AI SDK, hỗ trợ nhiều AI providers |
| Database | Supabase (PostgreSQL, pgvector, Auth, Storage) |
| Graph | React Flow (@xyflow/react), dagre layout |
| State | Zustand |
| Embedding | @xenova/transformers (local, browser-side) |

## Cài đặt

### Yêu cầu

- Node.js 20+
- Tài khoản Supabase
- API key của AI provider bạn muốn dùng

### Bước 1 — Clone và cài dependencies

```bash
git clone <repo-url>
cd grouply
npm install
```

### Bước 2 — Tạo Supabase project

1. Tạo project mới tại [supabase.com](https://supabase.com)
2. Vào **Settings → Database → Extensions**, bật `vector`
3. Chạy migration theo thứ tự trong `supabase/migrations/`:

```bash
# Chạy trong Supabase SQL Editor hoặc psql
001_init.sql
002_project_documents.sql
003_document_chunks.sql
004_rag_v2.sql
```

### Bước 3 — Cấu hình environment

```bash
cp .env.local.example .env.local
```

Điền vào `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=      # Project URL trong Supabase dashboard
NEXT_PUBLIC_SUPABASE_ANON_KEY= # anon/public key
SUPABASE_SERVICE_ROLE_KEY=     # service_role key (chỉ dùng server-side)
ANTHROPIC_API_KEY=             # API key cho AI provider (tùy chọn)
GROQ_API_KEY=                  # API key cho AI provider (tùy chọn)
ENCRYPTION_SECRET=             # chuỗi ngẫu nhiên 32 ký tự để mã hóa BYOK keys
```

### Bước 4 — Chạy

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Cấu trúc dự án

```
app/
  (auth)/login|register/     # Trang đăng nhập / đăng ký
  dashboard/                 # Danh sách projects
  project/[id]/              # Workspace của project
  api/ai/chat/               # Streaming AI endpoint
  api/project/               # CRUD project, upload/delete docs

components/
  workspace/                 # WorkspaceData (data) + WorkspaceLayout (UI)
  chat/                      # ChatPanel, ChatMessages, ChatInput
  task/ graph/ timeline/     # Task list, dependency graph, Gantt
  checklist/ documents/      # Sidebar deliverables, tab tài liệu
  contribution/              # Contribution bar theo thành viên

lib/
  ai/
    constants.ts             # Hằng số dùng chung (WRITE_TOOLS, chunk sizes...)
    tools/                   # Tool handlers theo domain (task, section, search...)
    prompts.ts               # System prompt builder
    retrieval.ts             # Vector + hybrid search
    chunker.ts               # Chia văn bản thành chunks
  chat/
    messageUtils.ts          # getMessageText, isWriteToolCall
  supabase/                  # client + server Supabase helpers

types/
  index.ts                   # Types chính, RetrievedChunk discriminated union

stores/
  chatStore.ts               # Zustand: pending tool calls, chat state
  graphStore.ts              # Zustand: graph layout state
```

## AI Tools

AI có thể gọi các tools sau trong một lượt chat:

| Tool | Mô tả |
|---|---|
| `read_project` | Đọc toàn bộ state: tasks, members, sections, checklist |
| `read_task` | Chi tiết một task |
| `read_member_load` | Workload từng thành viên |
| `read_tasks_by_section` | Tasks theo section |
| `search_documents` | Tìm kiếm semantic trong tài liệu nhóm |
| `add_task` | Tạo task mới |
| `update_task` | Cập nhật task |
| `delete_task` | Xóa task (owner only) |
| `add_section` | Tạo section mới |
| `add_checklist_item` | Thêm deliverable vào checklist |
| `link_task_to_item` | Gắn task với checklist item |
| `set_dependency` | Tạo quan hệ blocking giữa tasks |
| `remove_dependency` | Xóa dependency |
| `assign_tasks_batch` | Phân công hàng loạt |

Write tools (`add_*`, `update_*`, `delete_*`, `assign_*`, `set_*`, `remove_*`) yêu cầu user xác nhận trước khi áp dụng.

## License

MIT
