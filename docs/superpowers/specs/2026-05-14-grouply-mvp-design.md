# Grouply MVP 1.0 — Design Document

**Date:** 2026-05-14
**Stack:** Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + ReactFlow v12 + Supabase hosted + Anthropic claude-sonnet-4-20250514
**Scope:** Toàn bộ 4 sprint theo spec gốc, chạy local trước, deploy Vercel sau

---

## 1. Architecture

Một Next.js monorepo duy nhất. Không có backend riêng — API routes trong Next.js đảm nhận toàn bộ server logic. Supabase hosted free tier cung cấp PostgreSQL, Realtime, và Auth.

```
grouply/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── dashboard/page.tsx
│   ├── project/new/page.tsx
│   ├── project/[id]/page.tsx          # workspace chính
│   ├── project/[id]/list/page.tsx     # list view mobile fallback
│   ├── settings/page.tsx
│   ├── invite/[token]/page.tsx
│   └── api/
│       └── ai/chat/route.ts
├── components/
│   ├── graph/
│   │   ├── TaskGraph.tsx
│   │   ├── nodes/TaskNode.tsx
│   │   ├── nodes/GhostTaskNode.tsx
│   │   ├── nodes/SectionNode.tsx
│   │   └── edges/DependencyEdge.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── Message.tsx
│   │   ├── ActionPreviewCard.tsx
│   │   └── SimulateModal.tsx
│   ├── checklist/ChecklistSidebar.tsx
│   ├── task/TaskDrawer.tsx
│   ├── task/ClaimBadge.tsx
│   ├── contribution/ContributionBar.tsx
│   └── ui/                            # shadcn components
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── ai/context.ts
│   ├── ai/tools.ts
│   ├── ai/execute.ts
│   ├── ai/prompts.ts
│   └── ai/simulate.ts                 # dual-mode: build prompt string
├── stores/
│   ├── projectStore.ts
│   ├── graphStore.ts
│   └── chatStore.ts
├── types/index.ts
└── supabase/migrations/001_init.sql
```

**ENV vars (local `.env.local`):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
ENCRYPTION_SECRET          # để encrypt BYOK key
```

---

## 2. Database Schema (Supabase / PostgreSQL)

Giữ nguyên 100% theo spec gốc. Migration file `supabase/migrations/001_init.sql`.

### Tables

```sql
profiles (id, name, avatar_url, byok_key, created_at)
projects (id, name, subject, description, deadline, owner_id, created_at)
project_members (id, project_id, user_id, role, joined_at)
sections (id, project_id, name, color, ord, created_at)
checklist_items (id, project_id, name, description, ord, created_at)
tasks (id, project_id, section_id, checklist_item_id, name, description,
       assignee_id, status, type, deadline, blocked_by_id, is_optional,
       pos_x, pos_y, created_by, created_at, updated_at)
task_claims (id, task_id, user_id, created_at)
task_documents (id, task_id, url, name, created_by, created_at)
task_history (id, task_id, user_id, action, old_value, new_value, created_at)
project_invites (id, project_id, token, created_by, expires_at, created_at)
```

### Realtime

Enable Realtime trên: `tasks`, `task_claims`, `task_history`, `checklist_items`

### Row Level Security

- `projects`, `tasks`, `sections`, `checklist_items` — chỉ member của project đọc/ghi được
- `project_invites` — public read, chỉ owner write
- `profiles` — public read, chỉ owner write
- `task_claims`, `task_documents`, `task_history` — chỉ member của project tương ứng

---

## 3. Auth

- Supabase Auth: Google OAuth + email/password
- Next.js middleware bảo vệ tất cả routes trừ `/login`, `/register`, `/invite/[token]`
- Login → redirect `/dashboard`
- `/invite/[token]` — public access, nhưng phải login trước khi accept. Nếu chưa login → redirect `/login?redirect=/invite/[token]`
- BYOK key: encrypt bằng `ENCRYPTION_SECRET` trước khi lưu `profiles.byok_key`, decrypt trước khi dùng

---

## 4. Pages & Routes

| Route | Mô tả |
|-------|-------|
| `/` | Redirect `/dashboard` nếu logged in, `/login` nếu chưa |
| `/login` | Google OAuth + email login |
| `/register` | Đăng ký email |
| `/dashboard` | Danh sách projects — project cards với name, subject, deadline, checklist progress, member avatars |
| `/project/new` | Form tạo project (name*, subject, deadline*, brief optional). Sau submit: tạo project + section 'Chung' mặc định, nếu có brief → gọi parse-brief → ghost nodes trong chat |
| `/project/[id]` | Workspace chính: Checklist sidebar (240px) + Graph canvas (flex) + Chat panel (320px) + Contribution bar (footer) |
| `/project/[id]/list` | List view fallback cho mobile |
| `/settings` | Profile edit + BYOK API key |
| `/invite/[token]` | Accept invite → INSERT project_members → redirect workspace |

---

## 5. Workspace Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Header: Logo · Project name · Deadline · Members · Settings    │
├────────────┬───────────────────────────────────┬───────────────┤
│ CHECKLIST  │ GRAPH TASK MAP                    │ CHAT          │
│ 240px      │ flex                              │ 320px         │
│ collapsible│ [Graph|List] [Auto-layout]        │ collapsible   │
│            │                                   │               │
│            │ ReactFlow canvas                  │ Messages      │
│            │                                   │               │
│            │                           [🗺]    │ [Input][Send] │
├────────────┴───────────────────────────────────┴───────────────┤
│ CONTRIBUTION BAR (collapsible footer)                          │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Graph (ReactFlow)

### Node Types

**SectionNode** — ReactFlow GroupNode. Màu nền từ palette 8 màu pastel. Resize được. Double-click tên → rename inline. Right-click → Delete (confirm nếu có tasks).

**TaskNode** — card 200px wide. Hiển thị:
- Status badge (click → cycle todo→doing→review→done)
- Deadline
- Tên task (2 dòng max)
- Assignee avatar (click → dropdown assign/reassign)
- Type badge
- Claim count stack avatar
- Checklist item link icon
- Border màu theo status: todo=gray, doing=blue, review=amber, done=teal+opacity0.6, blocked=red+⚡

Interactions:
- Hover → hiện 4 edge handles
- Click → mở Task Drawer
- Kéo trong section → update pos_x, pos_y (debounce 500ms → save DB)
- Kéo sang section khác → update section_id + pos
- Double-click vùng trống section → tạo task mới tại vị trí đó

**GhostTaskNode** — clone TaskNode, opacity 0.5, border nét đứt tím, pointer-events none.

### DependencyEdge

- Màu xám khi source chưa done, xanh teal khi done
- Animated dashed khi source đang doing
- Click → tooltip "Task A → Task B · [× Xóa]"
- Validate no circular dependency trước khi tạo

### State Management

Zustand `graphStore`:
```ts
{
  nodes: Node[]         // SectionNode + TaskNode
  edges: Edge[]         // DependencyEdge
  ghostNodes: Node[]    // GhostTaskNode từ AI preview
  ghostEdges: Edge[]
  setGhostPreview(nodes, edges): void
  clearGhost(): void
  commitGhost(): void   // trigger execute tool calls
}
```

Realtime: Subscribe channel `tasks:project_id=eq.{id}` và `sections` → sync graphStore tự động.

### Toolbar

Nổi phía trên canvas:
- **Auto-layout** — dagre topological sort, sections trái→phải theo dependency
- **Zoom fit** — ReactFlow fitView()
- **Graph | List** toggle

Minimap: ReactFlow built-in MiniMap, góc phải dưới.

Pan: chuột giữa hoặc Space+kéo. Zoom: scroll/pinch.

---

## 7. Task Drawer

Overlay 400px từ phải. Graph vẫn visible phía sau. Đóng: ESC, click ngoài, ×.

Sections:
1. Tên task (editable inline)
2. Status badge (dropdown) · Assignee avatar (dropdown) · Deadline (date picker)
3. Description (markdown textarea)
4. Loại task (dropdown: output/coordination/research/review)
5. Checklist item link (dropdown)
6. Optional toggle
7. Blocked by (search tasks)
8. Tài liệu (list links + "Thêm link")
9. Claim list — theo thứ tự thời gian. Buttons: "AI đề xuất" (gọi suggest_assignment) + "Assign thủ công" (dropdown)
10. Review section — hiện khi status=review: Reviewer dropdown + [✓ Approve] [↩ Request changes]
11. Activity log — task_history entries
12. Button "💬 Hỏi AI về task này" → mở chat với selected_task_id context

---

## 8. Checklist Sidebar

240px, collapsible (state lưu localStorage).

- Item status tự động:
  - `pending` (□) — chưa có task linked hoặc tất cả todo
  - `in_progress` (◑) — có ít nhất 1 task doing/review
  - `done` (■) — tất cả task linked done. Auto-reopen nếu task nào reopen.
- Coverage gap ⚠ amber — item không có linked task
- Click item → highlight linked tasks trên graph (các node khác opacity 0.3)
- Progress bar: X/N items done + teal progress bar
- Button 🔍 → AI review completeness qua chat
- "+ Add item" → input inline, Enter save

---

## 9. AI Chat Agent

### Dual Mode

Chat panel có toggle: `[🤖 API] [📋 Simulate]`

**API mode:**
- POST `/api/ai/chat` với `{ project_id, message, conversation_history, selected_task_id? }`
- Server build system prompt → gọi Anthropic với tool definitions → parse tool calls → build preview
- Trả về `{ text, tool_calls, preview }`
- Client hiện ghost nodes + ActionPreviewCard với "N thay đổi · [Commit] [Discard]"
- Commit → POST lại với `commit_tool_calls` → server execute vào DB → Realtime push
- Undo toast 5 giây sau Commit

**Simulate mode:**
- `lib/ai/simulate.ts`: `buildSimulatePrompt(context, history, userMessage)` → string
- System prompt bổ sung yêu cầu output tool calls theo format:
  ```
  <tool_calls>
  [{"name": "tool_name", "input": {...}}, ...]
  </tool_calls>
  ```
- SimulateModal 2 bước:
  1. Textarea readonly với full prompt + nút Copy + hướng dẫn "Paste vào Claude.ai, copy toàn bộ response"
  2. Textarea paste response + nút Parse → extract `<tool_calls>` block → build ghost preview → Commit/Discard như bình thường

### Tool Set (12 tools)

| Tool | Input | Output | Quyền |
|------|-------|--------|-------|
| read_project | project_id | tasks[], members[], checklist[], sections[] | Tất cả |
| read_task | task_id | Task đầy đủ | Tất cả |
| read_member_load | project_id | Mỗi member: tasks_doing[], tasks_todo[], total | Tất cả |
| parse_brief | content, deadline, member_count | checklist_items[], tasks[] gợi ý | Tất cả |
| add_task | name, section_id, type, ... | task_id | Tất cả |
| update_task | task_id, fields{} | task updated | Owner + assignee |
| delete_task | task_id | success | Owner |
| add_section | name, color? | section_id | Tất cả |
| add_checklist_item | name, description? | item_id | Tất cả |
| link_task_to_item | task_id, checklist_item_id | success | Tất cả |
| set_dependency | task_id, blocked_by_id | success (validate no cycle) | Tất cả |
| remove_dependency | task_id | success | Tất cả |
| suggest_assignment | task_id | { recommended_user_id, reason, load_comparison } | Owner |

### System Prompt

Inject mỗi conversation với: project context (name, subject, deadline, days remaining), members summary, checklist status, current user role. Trả lời tiếng Việt, ngắn gọn. Giải thích lý do trước khi gọi tool. Không gọi update/delete nếu chưa được yêu cầu rõ ràng.

### API endpoint `/api/ai/chat`

```ts
POST body: {
  project_id, message, conversation_history,
  selected_task_id?, commit_tool_calls?
}

if (commit_tool_calls) → executeToolCalls() → return { executed: true }
else → normal chat flow → return { text, tool_calls, preview }
```

API key priority: `user.byok_key` (decrypt) → `ANTHROPIC_API_KEY` env.

### Parse-brief khi tạo project

Sau submit `/project/new`, nếu có brief → tự động POST `/api/ai/chat` với message trigger parse_brief → ghost nodes hiện trong chat panel → user Commit một lần để tạo toàn bộ structure.

---

## 10. Claim & Assign Flow

**Claim:**
- Hover TaskNode (assignee=null) → badge "+ Claim" góc dưới
- Click → INSERT task_claims. Avatar xuất hiện trong claim badge.
- Stack tối đa 3 avatars + "+N". Tooltip: danh sách tên.
- Click avatar của mình → DELETE task_claims (rút claim)
- Owner nhận in-app notification khi có claim mới

**Assign (trong Task Drawer):**
- List claimers theo thứ tự claim
- "Assign thủ công" → dropdown chọn bất kỳ member
- "AI đề xuất" → gọi suggest_assignment tool → trả về đề xuất + lý do trong chat
- Sau assign: notification đến người được assign, task_claims của task bị xóa

---

## 11. Contribution Bar

Footer collapsible, mặc định open. Visible cho tất cả members.

- Tính %: `COUNT tasks.done where assignee = member / total tasks.done in project × 100`
- Subscribe Realtime `tasks` channel → update real-time
- Hover bar → tooltip breakdown theo type (output/coordination/research/review)
- Click bar → modal chi tiết: tasks done, tasks doing, timeline activity
- Hiển thị alphabetical theo tên, không sort, không màu đỏ

---

## 12. Sprint Plan

| Sprint | Tuần | Deliverable |
|--------|------|-------------|
| 1 | 1–2 | Auth + DB schema + Dashboard + Tạo project + Section + Task CRUD + List view |
| 2 | 3–4 | ReactFlow graph: TaskNode, SectionNode, kéo thả, dependency edge, GhostNode, Realtime sync |
| 3 | 5–6 | AI Chat Agent: tool use, ghost preview, Commit/Discard, Undo, Parse-brief, Simulate mode |
| 4 | 7–8 | Claim + Assign + AI suggest + Checklist sidebar + Contribution bar + Task Drawer đầy đủ |

**Ưu tiên không cắt:** Sprint 2 (Graph) và Sprint 3 (AI agent) — đây là hai giả định core cần validate.

---

## 13. Quyết định thiết kế đáng chú ý

1. **Simulate mode** dùng `<tool_calls>` XML block thay vì Anthropic native tool use format — vì Claude.ai trả về markdown, không phải API response. Parser đơn giản, robust với format cố định.

2. **Ghost preview không execute** — server chỉ build preview state, không chạm DB cho đến khi user Commit. An toàn với mọi AI suggestion.

3. **Zustand graphStore** tách biệt `nodes/edges` (thật) và `ghostNodes/ghostEdges` (preview) — tránh merge state phức tạp khi Commit/Discard.

4. **Realtime qua Supabase channel** — client subscribe và sync graphStore trực tiếp, không cần polling.

5. **BYOK encrypt** bằng app-layer symmetric encryption với `ENCRYPTION_SECRET` env — không phụ thuộc Supabase Vault (chỉ có paid tier).

6. **Dagre** cho auto-layout — thư viện nhỏ, tích hợp tốt với ReactFlow, đủ cho topological sort.
