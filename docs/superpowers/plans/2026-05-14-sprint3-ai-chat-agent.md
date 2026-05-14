# Sprint 3: AI Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI Chat Agent với Anthropic tool use, ghost preview flow, Commit/Discard/Undo, Simulate mode (export prompt → paste response), và parse-brief khi tạo project.

**Architecture:** ChatPanel là client component 320px bên phải workspace. Zustand `chatStore` giữ conversation history và pending tool calls. `/api/ai/chat` route xử lý Anthropic API call và tool execution. Simulate mode dùng `lib/ai/simulate.ts` để build prompt string, parse `<tool_calls>` XML từ response paste vào.

**Prerequisites:** Sprint 1 + Sprint 2 hoàn thành. Workspace shell đã có.

**Tech Stack:** @anthropic-ai/sdk, Zustand chatStore, Anthropic claude-sonnet-4-20250514 với tool use

---

## File Map

```
lib/ai/
├── context.ts        # buildProjectContext — fetch DB, format for prompt
├── prompts.ts        # buildSystemPrompt(context, user, mode)
├── tools.ts          # TOOL_DEFINITIONS array cho Anthropic SDK
├── execute.ts        # executeToolCalls(toolCalls, projectId, userId) → DB writes
└── simulate.ts       # buildSimulatePrompt, parseSimulateResponse

stores/
└── chatStore.ts      # conversation history, pending tool calls, mode toggle

components/chat/
├── ChatPanel.tsx          # Main panel, message list, input
├── Message.tsx            # Single message bubble
├── ActionPreviewCard.tsx  # Commit/Discard card sau AI response
└── SimulateModal.tsx      # Step 1: copy prompt / Step 2: paste response

app/api/ai/chat/
└── route.ts          # POST handler
```

---

### Task 1: chatStore

**Files:**
- Create: `stores/chatStore.ts`

- [ ] **Step 1: Viết chatStore**

```typescript
// stores/chatStore.ts
import { create } from 'zustand'

export type ChatMode = 'api' | 'simulate'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface ToolCall {
  name: string
  input: Record<string, unknown>
  id?: string
}

export interface GhostPreview {
  description: string
  changes: string[]
}

export interface ChatState {
  messages: ChatMessage[]
  pendingToolCalls: ToolCall[]
  ghostPreview: GhostPreview | null
  mode: ChatMode
  loading: boolean

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearPending: () => void
  setMode: (mode: ChatMode) => void
  setLoading: (v: boolean) => void
  setPending: (toolCalls: ToolCall[], preview: GhostPreview) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  pendingToolCalls: [],
  ghostPreview: null,
  mode: 'api',
  loading: false,

  addMessage: (msg) => set(state => ({
    messages: [...state.messages, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }],
  })),

  clearPending: () => set({ pendingToolCalls: [], ghostPreview: null }),

  setMode: (mode) => set({ mode }),

  setLoading: (loading) => set({ loading }),

  setPending: (pendingToolCalls, ghostPreview) => set({ pendingToolCalls, ghostPreview }),

  reset: () => set({ messages: [], pendingToolCalls: [], ghostPreview: null }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add stores/chatStore.ts
git commit -m "feat: add chatStore Zustand"
```

---

### Task 2: AI Context Builder

**Files:**
- Create: `lib/ai/context.ts`

- [ ] **Step 1: Viết context builder**

```typescript
// lib/ai/context.ts
import { createClient } from '@/lib/supabase/server'
import { differenceInDays, format } from 'date-fns'

export interface ProjectContext {
  projectId: string
  projectName: string
  subject: string
  deadline: string
  daysRemaining: number
  today: string
  members: MemberContext[]
  checklistSummary: ChecklistSummaryItem[]
  tasks: TaskContext[]
  sections: SectionContext[]
}

export interface MemberContext {
  id: string
  name: string
  role: string
}

export interface ChecklistSummaryItem {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'done'
  taskCount: number
  doneTaskCount: number
}

export interface TaskContext {
  id: string
  name: string
  status: string
  type: string
  assigneeId: string | null
  assigneeName: string | null
  sectionId: string | null
  sectionName: string | null
  checklistItemId: string | null
  blockedById: string | null
  deadline: string | null
  isOptional: boolean
}

export interface SectionContext {
  id: string
  name: string
}

export async function buildProjectContext(projectId: string): Promise<ProjectContext> {
  const supabase = await createClient()

  const [
    { data: project },
    { data: members },
    { data: tasks },
    { data: sections },
    { data: checklistItems },
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('project_members').select('*, profile:profiles(id, name)').eq('project_id', projectId),
    supabase.from('tasks').select('*, assignee:profiles(id, name)').eq('project_id', projectId),
    supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
    supabase.from('checklist_items').select('*').eq('project_id', projectId).order('ord'),
  ])

  const today = new Date()
  const deadline = project?.deadline ? new Date(project.deadline) : today
  const daysRemaining = differenceInDays(deadline, today)

  const memberList: MemberContext[] = (members ?? []).map(m => ({
    id: (m.profile as any)?.id ?? m.user_id,
    name: (m.profile as any)?.name ?? 'Unknown',
    role: m.role,
  }))

  const taskList: TaskContext[] = (tasks ?? []).map(t => {
    const section = (sections ?? []).find(s => s.id === t.section_id)
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      type: t.type,
      assigneeId: t.assignee_id,
      assigneeName: (t.assignee as any)?.name ?? null,
      sectionId: t.section_id,
      sectionName: section?.name ?? null,
      checklistItemId: t.checklist_item_id,
      blockedById: t.blocked_by_id,
      deadline: t.deadline,
      isOptional: t.is_optional,
    }
  })

  const checklistSummary: ChecklistSummaryItem[] = (checklistItems ?? []).map(ci => {
    const ciTasks = taskList.filter(t => t.checklistItemId === ci.id)
    const doneTasks = ciTasks.filter(t => t.status === 'done')
    let status: 'pending' | 'in_progress' | 'done' = 'pending'
    if (ciTasks.length > 0 && doneTasks.length === ciTasks.length) status = 'done'
    else if (ciTasks.some(t => t.status === 'doing' || t.status === 'review')) status = 'in_progress'
    return {
      id: ci.id,
      name: ci.name,
      status,
      taskCount: ciTasks.length,
      doneTaskCount: doneTasks.length,
    }
  })

  return {
    projectId,
    projectName: project?.name ?? '',
    subject: project?.subject ?? '',
    deadline: project?.deadline ?? '',
    daysRemaining,
    today: format(today, 'yyyy-MM-dd'),
    members: memberList,
    checklistSummary,
    tasks: taskList,
    sections: (sections ?? []).map(s => ({ id: s.id, name: s.name })),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/context.ts
git commit -m "feat: add AI context builder"
```

---

### Task 3: System Prompt Builder

**Files:**
- Create: `lib/ai/prompts.ts`

- [ ] **Step 1: Viết prompts.ts**

```typescript
// lib/ai/prompts.ts
import type { ProjectContext } from './context'

export function buildSystemPrompt(
  context: ProjectContext,
  currentUserName: string,
  currentUserRole: string,
  mode: 'api' | 'simulate' = 'api'
): string {
  const membersSummary = context.members
    .map(m => `${m.name}${m.role === 'owner' ? ' (nhóm trưởng)' : ''}`)
    .join(', ')

  const checklistSummary = context.checklistSummary.map(ci => {
    const icon = ci.status === 'done' ? '✓' : ci.status === 'in_progress' ? '◑' : '□'
    const warn = ci.taskCount === 0 ? ' ⚠' : ''
    return `${icon} ${ci.name} (${ci.doneTaskCount}/${ci.taskCount} tasks)${warn}`
  }).join('\n')

  const basePrompt = `Bạn là AI assistant của nhóm làm việc trên project "${context.projectName}".
Môn học: ${context.subject || 'Không có'}. Deadline nộp: ${context.deadline}. Hôm nay: ${context.today}.
Số ngày còn lại: ${context.daysRemaining}.

THÀNH VIÊN:
${membersSummary}

TRẠNG THÁI CHECKLIST:
${checklistSummary || 'Chưa có checklist item nào.'}

NGƯỜI DÙNG HIỆN TẠI: ${currentUserName} (vai trò: ${currentUserRole})

NHIỆM VỤ CỦA BẠN:
- Trả lời câu hỏi về project bằng tiếng Việt, ngắn gọn.
- Khi cần thao tác lên project: gọi tool phù hợp.
- Luôn giải thích ngắn gọn lý do trước khi gọi tool.
- Không gọi tool update/delete nếu người dùng chưa yêu cầu rõ ràng.
- Nếu không chắc: hỏi lại trước khi thực hiện.

QUY TẮC PHÂN QUYỀN:
- suggest_assignment và delete_task chỉ nhóm trưởng gọi được.
- update_task chỉ nhóm trưởng hoặc người được assign task đó.`

  if (mode === 'simulate') {
    return basePrompt + `

QUAN TRỌNG — SIMULATE MODE:
Khi bạn muốn gọi tools, hãy output theo định dạng sau ở CUỐI response:
<tool_calls>
[{"name": "tool_name", "input": {...}}, ...]
</tool_calls>

Nếu không cần gọi tool nào, không cần thêm block <tool_calls>.
Trả về JSON hợp lệ bên trong block tool_calls.`
  }

  return basePrompt
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/prompts.ts
git commit -m "feat: add system prompt builder"
```

---

### Task 4: Tool Definitions

**Files:**
- Create: `lib/ai/tools.ts`

- [ ] **Step 1: Viết tool definitions**

```typescript
// lib/ai/tools.ts
import type { Tool } from '@anthropic-ai/sdk/resources/messages'

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'read_project',
    description: 'Đọc toàn bộ state của project: tasks, members, checklist items, sections.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID của project' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'read_task',
    description: 'Đọc chi tiết một task: mô tả, assignee, blocked_by, claims, documents.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID của task' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'read_member_load',
    description: 'Xem workload của từng thành viên: tasks đang làm, tasks todo, tổng load.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID của project' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'parse_brief',
    description: 'Phân tích đề bài và đề xuất checklist items + task list với section và dependency.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Nội dung đề bài' },
        deadline: { type: 'string', description: 'Deadline dự án (YYYY-MM-DD)' },
        member_count: { type: 'number', description: 'Số thành viên trong nhóm' },
      },
      required: ['content', 'deadline', 'member_count'],
    },
  },
  {
    name: 'add_task',
    description: 'Thêm task mới vào project.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên task' },
        section_id: { type: 'string', description: 'ID section chứa task' },
        type: { type: 'string', enum: ['output', 'coordination', 'research', 'review'] },
        checklist_item_id: { type: 'string', description: 'optional' },
        blocked_by_id: { type: 'string', description: 'optional' },
        deadline: { type: 'string', description: 'YYYY-MM-DD, optional' },
        assignee_id: { type: 'string', description: 'optional' },
        pos_x: { type: 'number' },
        pos_y: { type: 'number' },
      },
      required: ['name', 'section_id', 'type'],
    },
  },
  {
    name: 'update_task',
    description: 'Cập nhật thông tin của một task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        fields: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['todo', 'doing', 'review', 'done', 'blocked'] },
            assignee_id: { type: 'string' },
            deadline: { type: 'string' },
            section_id: { type: 'string' },
            checklist_item_id: { type: 'string' },
            blocked_by_id: { type: 'string' },
            is_optional: { type: 'boolean' },
          },
        },
      },
      required: ['task_id', 'fields'],
    },
  },
  {
    name: 'delete_task',
    description: 'Xóa task. Chỉ owner.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'add_section',
    description: 'Thêm section mới.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'hex color optional' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_checklist_item',
    description: 'Thêm deliverable item vào checklist.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'optional' },
      },
      required: ['name'],
    },
  },
  {
    name: 'link_task_to_item',
    description: 'Liên kết task với checklist item.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        checklist_item_id: { type: 'string' },
      },
      required: ['task_id', 'checklist_item_id'],
    },
  },
  {
    name: 'set_dependency',
    description: 'Tạo dependency: task bị block bởi task khác.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        blocked_by_id: { type: 'string' },
      },
      required: ['task_id', 'blocked_by_id'],
    },
  },
  {
    name: 'remove_dependency',
    description: 'Xóa dependency của task.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'suggest_assignment',
    description: 'AI đề xuất người phù hợp nhất cho task. Chỉ owner.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/tools.ts
git commit -m "feat: add AI tool definitions (12 tools)"
```

---

### Task 5: Tool Executor

**Files:**
- Create: `lib/ai/execute.ts`

- [ ] **Step 1: Viết execute.ts**

```typescript
// lib/ai/execute.ts
import { createClient } from '@/lib/supabase/server'
import { buildProjectContext } from './context'
import type { ToolCall } from '@/stores/chatStore'

const SECTION_COLORS = ['#EEEDFE','#FEF3C7','#D1FAE5','#FEE2E2','#DBEAFE','#F3E8FF','#ECFDF5','#FFF7ED']

export interface ToolResult {
  toolName: string
  result: unknown
  error?: string
}

export async function executeToolCall(
  tool: ToolCall,
  projectId: string,
  userId: string
): Promise<ToolResult> {
  const supabase = await createClient()
  const { name, input } = tool

  try {
    switch (name) {
      case 'read_project': {
        const context = await buildProjectContext(projectId)
        return { toolName: name, result: context }
      }
      case 'read_task': {
        const { data } = await supabase
          .from('tasks')
          .select('*, assignee:profiles(*), claims:task_claims(*, profile:profiles(*)), documents:task_documents(*)')
          .eq('id', input.task_id as string)
          .single()
        return { toolName: name, result: data }
      }
      case 'read_member_load': {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('assignee_id, status, name, id')
          .eq('project_id', projectId)
          .in('status', ['todo', 'doing', 'review'])
        const { data: members } = await supabase
          .from('project_members')
          .select('*, profile:profiles(id, name)')
          .eq('project_id', projectId)
        const load = (members ?? []).map(m => {
          const memberId = (m.profile as any)?.id
          const memberTasks = (tasks ?? []).filter(t => t.assignee_id === memberId)
          return {
            memberId,
            memberName: (m.profile as any)?.name,
            tasks_doing: memberTasks.filter(t => t.status === 'doing' || t.status === 'review'),
            tasks_todo: memberTasks.filter(t => t.status === 'todo'),
            total_load_count: memberTasks.length,
          }
        })
        return { toolName: name, result: load }
      }
      case 'add_task': {
        const { data } = await supabase.from('tasks').insert({
          project_id: projectId,
          section_id: (input.section_id as string) || null,
          name: input.name as string,
          type: (input.type as string) || 'output',
          checklist_item_id: (input.checklist_item_id as string) || null,
          blocked_by_id: (input.blocked_by_id as string) || null,
          deadline: (input.deadline as string) || null,
          assignee_id: (input.assignee_id as string) || null,
          pos_x: (input.pos_x as number) || 50,
          pos_y: (input.pos_y as number) || 50,
          created_by: userId,
        }).select().single()
        return { toolName: name, result: data }
      }
      case 'update_task': {
        const fields = input.fields as Record<string, unknown>
        const { data } = await supabase
          .from('tasks').update(fields).eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'delete_task': {
        await supabase.from('tasks').delete().eq('id', input.task_id as string)
        return { toolName: name, result: { success: true } }
      }
      case 'add_section': {
        const { data: existing } = await supabase.from('sections').select('id').eq('project_id', projectId)
        const color = (input.color as string) || SECTION_COLORS[(existing?.length ?? 0) % SECTION_COLORS.length]
        const { data } = await supabase.from('sections').insert({
          project_id: projectId,
          name: input.name as string,
          color,
          ord: existing?.length ?? 0,
        }).select().single()
        return { toolName: name, result: data }
      }
      case 'add_checklist_item': {
        const { data: existing } = await supabase.from('checklist_items').select('id').eq('project_id', projectId)
        const { data } = await supabase.from('checklist_items').insert({
          project_id: projectId,
          name: input.name as string,
          description: (input.description as string) || null,
          ord: existing?.length ?? 0,
        }).select().single()
        return { toolName: name, result: data }
      }
      case 'link_task_to_item': {
        const { data } = await supabase
          .from('tasks').update({ checklist_item_id: input.checklist_item_id as string })
          .eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'set_dependency': {
        const { data } = await supabase
          .from('tasks').update({ blocked_by_id: input.blocked_by_id as string })
          .eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'remove_dependency': {
        const { data } = await supabase
          .from('tasks').update({ blocked_by_id: null })
          .eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'suggest_assignment':
        return { toolName: name, result: { note: 'Use read_member_load to get context, then suggest.' } }
      default:
        return { toolName: name, result: null, error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    return { toolName: name, result: null, error: err.message }
  }
}

export async function executeToolCalls(
  toolCalls: ToolCall[],
  projectId: string,
  userId: string
): Promise<ToolResult[]> {
  return Promise.all(toolCalls.map(tc => executeToolCall(tc, projectId, userId)))
}

export function buildGhostPreview(toolCalls: ToolCall[]): { description: string; changes: string[] } {
  const changes = toolCalls.map(tc => {
    switch (tc.name) {
      case 'add_task': return `Thêm task: "${tc.input.name}"`
      case 'update_task': {
        const fields = tc.input.fields as Record<string, unknown>
        return `Cập nhật task (${Object.keys(fields).join(', ')})`
      }
      case 'delete_task': return `Xóa task`
      case 'add_section': return `Thêm section: "${tc.input.name}"`
      case 'add_checklist_item': return `Thêm checklist: "${tc.input.name}"`
      case 'link_task_to_item': return `Liên kết task với checklist item`
      case 'set_dependency': return `Tạo dependency`
      case 'remove_dependency': return `Xóa dependency`
      default: return tc.name
    }
  })
  return { description: `${toolCalls.length} thay đổi sẽ được thực hiện`, changes }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/execute.ts
git commit -m "feat: add tool executor and ghost preview builder"
```

---

### Task 6: Simulate Mode

**Files:**
- Create: `lib/ai/simulate.ts`

- [ ] **Step 1: Viết simulate.ts**

```typescript
// lib/ai/simulate.ts
import { buildSystemPrompt } from './prompts'
import { TOOL_DEFINITIONS } from './tools'
import type { ProjectContext } from './context'
import type { ToolCall } from '@/stores/chatStore'

export function buildSimulatePrompt(
  context: ProjectContext,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  currentUserName: string,
  currentUserRole: string
): string {
  const systemPrompt = buildSystemPrompt(context, currentUserName, currentUserRole, 'simulate')

  const toolsDescription = TOOL_DEFINITIONS.map(t =>
    `**${t.name}**: ${t.description}`
  ).join('\n')

  const historyText = conversationHistory.length > 0
    ? conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
    : '(Bắt đầu cuộc hội thoại)'

  return `${systemPrompt}

---

TOOLS CÓ THỂ GỌI:
${toolsDescription}

---

LỊCH SỬ HỘI THOẠI:
${historyText}

---

User: ${userMessage}`

export function parseSimulateResponse(responseText: string): ToolCall[] {
  const match = responseText.match(/<tool_calls>\s*([\s\S]*?)\s*<\/tool_calls>/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed)) return []
    return parsed.filter(tc => typeof tc.name === 'string' && typeof tc.input === 'object')
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/simulate.ts
git commit -m "feat: add simulate mode prompt builder and response parser"
```

---

### Task 7: API Route `/api/ai/chat`

**Files:**
- Create: `app/api/ai/chat/route.ts`

- [ ] **Step 1: Viết route.ts**

```typescript
// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildProjectContext } from '@/lib/ai/context'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { TOOL_DEFINITIONS } from '@/lib/ai/tools'
import { executeToolCalls, buildGhostPreview } from '@/lib/ai/execute'
import type { ToolCall } from '@/stores/chatStore'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { project_id, message, conversation_history = [], commit_tool_calls } = body

  // Commit path: execute tool calls đã được approve
  if (commit_tool_calls && Array.isArray(commit_tool_calls)) {
    await executeToolCalls(commit_tool_calls as ToolCall[], project_id, user.id)
    return NextResponse.json({ executed: true })
  }

  const { data: profile } = await supabase.from('profiles').select('name, byok_key').eq('id', user.id).single()
  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // API key: BYOK > env
  const apiKey = profile?.byok_key
    ? Buffer.from(profile.byok_key, 'base64').toString('utf-8')
    : process.env.ANTHROPIC_API_KEY!

  const context = await buildProjectContext(project_id)
  const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role)

  const anthropic = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [
    ...conversation_history.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    tools: TOOL_DEFINITIONS,
    messages,
  })

  let textContent = ''
  const toolCalls: ToolCall[] = []

  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
    }
  }

  const preview = toolCalls.length > 0 ? buildGhostPreview(toolCalls) : null

  return NextResponse.json({ text: textContent, tool_calls: toolCalls, preview })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/ai/chat/route.ts
git commit -m "feat: add /api/ai/chat route with Anthropic tool use"
```

---

### Task 8: Ghost Builder Helper

**Files:**
- Create: `lib/ai/ghostBuilder.ts`

- [ ] **Step 1: Viết ghostBuilder.ts**

```typescript
// lib/ai/ghostBuilder.ts
import type { Node, Edge } from '@xyflow/react'
import type { ToolCall } from '@/stores/chatStore'
import type { ProjectContext } from './context'

export function buildGhostNodesFromToolCalls(
  toolCalls: ToolCall[],
  context: ProjectContext
): { ghostNodes: Node[]; ghostEdges: Edge[] } {
  const ghostNodes: Node[] = []
  const ghostEdges: Edge[] = []
  let offsetY = 0

  for (const tc of toolCalls) {
    if (tc.name === 'add_task') {
      const input = tc.input as Record<string, unknown>
      const tempId = `ghost-${crypto.randomUUID()}`
      ghostNodes.push({
        id: tempId,
        type: 'ghostTaskNode',
        position: { x: (input.pos_x as number) || 50, y: ((input.pos_y as number) || 50) + offsetY },
        data: {
          task: {
            id: tempId,
            name: input.name as string,
            status: 'todo',
            type: (input.type as string) || 'output',
            assignee_id: null,
            deadline: (input.deadline as string) || null,
          },
          members: context.members,
          onUpdated: () => {},
        },
      })
      offsetY += 120
    }
  }

  return { ghostNodes, ghostEdges }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/ghostBuilder.ts
git commit -m "feat: add ghost node builder for AI preview"
```

---

### Task 9: Chat Components

**Files:**
- Create: `components/chat/Message.tsx`
- Create: `components/chat/ActionPreviewCard.tsx`
- Create: `components/chat/SimulateModal.tsx`
- Create: `components/chat/ChatPanel.tsx`

- [ ] **Step 1: Message component**

```typescript
// components/chat/Message.tsx
import type { ChatMessage } from '@/stores/chatStore'

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
      }`}>
        {message.content}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ActionPreviewCard**

```typescript
// components/chat/ActionPreviewCard.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import type { GhostPreview, ToolCall } from '@/stores/chatStore'

interface Props {
  preview: GhostPreview
  toolCalls: ToolCall[]
  projectId: string
  onCommit: () => void
  onDiscard: () => void
}

export function ActionPreviewCard({ preview, toolCalls, projectId, onCommit, onDiscard }: Props) {
  const [committing, setCommitting] = useState(false)
  const { toast } = useToast()

  async function handleCommit() {
    setCommitting(true)
    await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, commit_tool_calls: toolCalls }),
    })
    onCommit()
    toast({ title: 'Đã thực hiện thay đổi', description: `${toolCalls.length} thay đổi đã được áp dụng.`, duration: 5000 })
    setCommitting(false)
  }

  return (
    <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 mb-3">
      <p className="text-sm font-medium text-violet-900 mb-2">{preview.description}</p>
      <ul className="text-xs text-violet-700 space-y-1 mb-3">
        {preview.changes.map((c, i) => <li key={i}>• {c}</li>)}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleCommit} disabled={committing} className="bg-violet-600 hover:bg-violet-700 text-white">
          {committing ? 'Đang thực hiện...' : 'Commit'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard} disabled={committing}>Discard</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: SimulateModal**

```typescript
// components/chat/SimulateModal.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { parseSimulateResponse } from '@/lib/ai/simulate'
import { buildGhostPreview } from '@/lib/ai/execute'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'

interface Props {
  open: boolean
  prompt: string
  onClose: () => void
  onParsed: (toolCalls: ToolCall[], preview: GhostPreview, responseText: string) => void
}

export function SimulateModal({ open, prompt, onClose, onParsed }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [response, setResponse] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy prompt')

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt)
    setCopyLabel('Đã copy!')
    setTimeout(() => setCopyLabel('Copy prompt'), 2000)
  }

  function handleParse() {
    const toolCalls = parseSimulateResponse(response)
    const preview = buildGhostPreview(toolCalls)
    const textPart = response.replace(/<tool_calls>[\s\S]*<\/tool_calls>/, '').trim()
    onParsed(toolCalls, preview, textPart || response)
    setStep(1)
    setResponse('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setStep(1) } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Simulate — {step === 1 ? 'Copy Prompt' : 'Paste Response'}</DialogTitle>
        </DialogHeader>
        {step === 1 ? (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <p className="text-sm text-muted-foreground">Copy prompt, paste vào <strong>Claude.ai</strong>, copy toàn bộ response rồi quay lại bước 2.</p>
            <Textarea value={prompt} readOnly className="flex-1 font-mono text-xs resize-none" rows={12} />
            <div className="flex gap-2">
              <Button onClick={handleCopy}>{copyLabel}</Button>
              <Button variant="outline" onClick={() => setStep(2)}>Tôi đã có response →</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <p className="text-sm text-muted-foreground">Paste toàn bộ response từ Claude.ai vào đây rồi nhấn Parse.</p>
            <Textarea value={response} onChange={e => setResponse(e.target.value)} placeholder="Paste response..." className="flex-1 text-sm resize-none" rows={12} />
            <div className="flex gap-2">
              <Button onClick={handleParse} disabled={!response.trim()}>Parse & Preview</Button>
              <Button variant="outline" onClick={() => setStep(1)}>← Quay lại</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: ChatPanel**

```typescript
// components/chat/ChatPanel.tsx
'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { Message } from './Message'
import { ActionPreviewCard } from './ActionPreviewCard'
import { SimulateModal } from './SimulateModal'
import { buildSimulatePrompt } from '@/lib/ai/simulate'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ProjectContext } from '@/lib/ai/context'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'

interface Props {
  projectId: string
  context: ProjectContext
  currentUserName: string
  currentUserRole: string
}

export function ChatPanel({ projectId, context, currentUserName, currentUserRole }: Props) {
  const [input, setInput] = useState('')
  const [showSimulate, setShowSimulate] = useState(false)
  const [simulatePrompt, setSimulatePrompt] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, pendingToolCalls, ghostPreview, mode, loading, addMessage, setLoading, setPending, clearPending, setMode } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    addMessage({ role: 'user', content: text })
    setLoading(true)

    try {
      if (mode === 'simulate') {
        const history = messages.map(m => ({ role: m.role, content: m.content }))
        const prompt = buildSimulatePrompt(context, history, text, currentUserName, currentUserRole)
        setSimulatePrompt(prompt)
        setShowSimulate(true)
        setLoading(false)
        return
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          message: text,
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()

      if (data.text) addMessage({ role: 'assistant', content: data.text })

      if (data.tool_calls?.length > 0 && data.preview) {
        setPending(data.tool_calls, data.preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(data.tool_calls, context)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    } catch {
      addMessage({ role: 'assistant', content: 'Xin lỗi, có lỗi xảy ra. Thử lại nhé.' })
    }
    setLoading(false)
  }, [input, loading, mode, messages, projectId, context, currentUserName, currentUserRole, addMessage, setLoading, setPending, setGhostPreview])

  function handleSimulateParsed(toolCalls: ToolCall[], preview: GhostPreview, responseText: string) {
    if (responseText) addMessage({ role: 'assistant', content: responseText })
    if (toolCalls.length > 0) {
      setPending(toolCalls, preview)
      const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(toolCalls, context)
      setGhostPreview(ghostNodes, ghostEdges)
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">AI Chat</span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button className={`text-xs px-2 py-1 rounded-md ${mode === 'api' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`} onClick={() => setMode('api')}>🤖 API</button>
          <button className={`text-xs px-2 py-1 rounded-md ${mode === 'simulate' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`} onClick={() => setMode('simulate')}>📋 Simulate</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">Hỏi AI về project, phân công task, hoặc paste đề bài để bắt đầu.</p>
        )}
        {messages.map(m => <Message key={m.id} message={m} />)}

        {ghostPreview && pendingToolCalls.length > 0 && (
          <ActionPreviewCard
            preview={ghostPreview}
            toolCalls={pendingToolCalls}
            projectId={projectId}
            onCommit={() => { clearPending(); clearGhost() }}
            onDiscard={() => { clearPending(); clearGhost() }}
          />
        )}

        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-muted-foreground">Đang suy nghĩ...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={mode === 'simulate' ? 'Nhập câu hỏi → xuất prompt...' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm"
            rows={2}
          />
          <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()} className="self-end">Gửi</Button>
        </div>
      </div>

      <SimulateModal open={showSimulate} prompt={simulatePrompt} onClose={() => setShowSimulate(false)} onParsed={handleSimulateParsed} />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/chat/
git commit -m "feat: add ChatPanel, Message, ActionPreviewCard, SimulateModal"
```

---

### Task 10: Tích hợp ChatPanel vào WorkspaceClient

**Files:**
- Modify: `components/WorkspaceClient.tsx`
- Modify: `app/project/[id]/page.tsx`

- [ ] **Step 1: Cập nhật WorkspacePage để truyền aiContext**

Mở `app/project/[id]/page.tsx`. Thêm sau các fetch hiện có:

```typescript
const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
const { buildProjectContext } = await import('@/lib/ai/context')
const aiContext = await buildProjectContext(params.id)
```

Cập nhật return để truyền thêm props vào `WorkspaceClient`:

```typescript
<WorkspaceClient
  project={project}
  userId={user.id}
  userRole={membership.role as 'owner' | 'member'}
  initialSections={(sections ?? []) as Section[]}
  initialTasks={(tasks ?? []) as Task[]}
  members={memberProfiles}
  aiContext={aiContext}
  currentUserName={profile?.name ?? 'Unknown'}
/>
```

- [ ] **Step 2: Cập nhật WorkspaceClient Props và layout**

Mở `components/WorkspaceClient.tsx`. Thêm imports và cập nhật Props:

```typescript
import { ChatPanel } from '@/components/chat/ChatPanel'
import type { ProjectContext } from '@/lib/ai/context'

// Thêm vào Props interface:
aiContext: ProjectContext
currentUserName: string
```

Thay phần `{view === 'graph' ? ...}` thành 3-column layout:

```typescript
{view === 'graph' ? (
  <div className="flex h-full overflow-hidden">
    <div className="flex-1 relative overflow-hidden">
      <TaskGraph
        projectId={project.id}
        userId={userId}
        initialTasks={initialTasks}
        initialSections={initialSections}
        members={members}
        onToggleView={() => setView('list')}
        currentView="graph"
      />
    </div>
    <div className="w-80 shrink-0">
      <ChatPanel
        projectId={project.id}
        context={aiContext}
        currentUserName={currentUserName}
        currentUserRole={userRole}
      />
    </div>
  </div>
) : (
  // list view giữ nguyên như cũ
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/WorkspaceClient.tsx app/project/[id]/page.tsx
git commit -m "feat: integrate ChatPanel into workspace 3-column layout"
```

---

### Task 11: Parse-Brief khi tạo Project

**Files:**
- Modify: `components/project/CreateProjectForm.tsx`
- Modify: `components/WorkspaceClient.tsx`

- [ ] **Step 1: Lưu brief vào localStorage sau khi tạo project**

Mở `components/project/CreateProjectForm.tsx`. Trong `onSubmit`, sau khi tạo project thành công, thêm trước `router.push`:

```typescript
if (data.brief?.trim()) {
  localStorage.setItem(`grouply-brief-${project.id}`, data.brief.trim())
}
router.push(`/project/${project.id}?parseBrief=1`)
```

- [ ] **Step 2: Auto-trigger parse-brief trong WorkspaceClient**

Mở `components/WorkspaceClient.tsx`. Thêm imports:

```typescript
import { useSearchParams } from 'next/navigation'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
```

Thêm useEffect vào component (sau các state declarations):

```typescript
const searchParams = useSearchParams()
const { addMessage, setLoading, setPending } = useChatStore()
const { setGhostPreview } = useGraphStore()

useEffect(() => {
  if (searchParams.get('parseBrief') !== '1') return
  const brief = localStorage.getItem(`grouply-brief-${project.id}`)
  if (!brief) return
  localStorage.removeItem(`grouply-brief-${project.id}`)

  async function sendBrief() {
    setLoading(true)
    addMessage({ role: 'user', content: `Phân tích đề bài và tạo kế hoạch...` })
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          message: `Hãy phân tích đề bài sau và đề xuất checklist items + task list cho nhóm ${members.length} người, deadline ${project.deadline}:\n\n${brief}`,
          conversation_history: [],
        }),
      })
      const data = await res.json()
      if (data.text) addMessage({ role: 'assistant', content: data.text })
      if (data.tool_calls?.length > 0 && data.preview) {
        setPending(data.tool_calls, data.preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(data.tool_calls, aiContext)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    } catch {}
    setLoading(false)
  }

  sendBrief()
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Commit**

```bash
git add components/project/CreateProjectForm.tsx components/WorkspaceClient.tsx
git commit -m "feat: auto parse-brief when creating project with brief"
```

---

### Task 12: Sprint 3 Verification

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: không có lỗi.

- [ ] **Step 2: Test API mode**

```
1. Vào workspace — ChatPanel hiện bên phải, toggle "🤖 API" active
2. Gõ: "Có bao nhiêu task trong project này?"
   Expected: AI trả lời bằng tiếng Việt
3. Gõ: "Thêm task 'Viết báo cáo' vào section đầu tiên"
   Expected: ActionPreviewCard hiện "1 thay đổi · Thêm task: Viết báo cáo"
             Ghost node tím xuất hiện trên graph
4. Click Commit → ghost biến mất, node thật xuất hiện qua Realtime
   Expected: Toast "Đã thực hiện thay đổi"
```

- [ ] **Step 3: Test Simulate mode**

```
1. Toggle sang "📋 Simulate"
2. Gõ: "Thêm task test"
   Expected: SimulateModal mở — Step 1 với full prompt
3. Copy prompt → paste vào Claude.ai → copy response
4. Click "Tôi đã có response" → Step 2 → paste response
   Response phải chứa block: <tool_calls>[{"name":"add_task","input":{...}}]</tool_calls>
5. Click "Parse & Preview"
   Expected: ActionPreviewCard + ghost node xuất hiện
6. Commit → thay đổi thật trong DB
```

- [ ] **Step 4: Test parse-brief**

```
1. Tạo project mới với brief text (VD: "Phân tích thị trường điện thoại Việt Nam...")
2. Submit → redirect workspace?parseBrief=1
3. ChatPanel tự động gửi message và AI phân tích
   Expected: Ghost nodes + ActionPreviewCard
4. Commit → checklist items + tasks được tạo
```

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: sprint 3 complete — AI Chat Agent with tool use and simulate mode"
```