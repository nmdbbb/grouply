# Prompt System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `buildSystemPrompt` into 5 ordered blocks and add Groq-specific English tool description overrides to improve tool-calling reliability and reduce token usage by ~35%.

**Architecture:** Single `buildSystemPrompt` function gains an optional `provider` param; when `provider === 'groq'`, a short English suffix is appended. `toGroqTools()` in `groq.ts` gains a `GROQ_TOOL_DESC_OVERRIDES` map that replaces Vietnamese descriptions with terse English ones so Llama 3.3 understands when to call each tool.

**Tech Stack:** TypeScript, Next.js App Router, Groq SDK (`groq-sdk`), Anthropic SDK (`@anthropic-ai/sdk`)

---

## File Map

| File | Change |
|------|--------|
| `lib/ai/prompts.ts` | Rewrite `buildSystemPrompt` — 5-block structure, add `provider?` param, Groq suffix |
| `lib/ai/groq.ts` | Add `GROQ_TOOL_DESC_OVERRIDES`, update `toGroqTools()` to merge descriptions |
| `app/api/ai/chat/route.ts` | Pass `provider` to `buildSystemPrompt` |

---

### Task 1: Restructure `buildSystemPrompt` in `lib/ai/prompts.ts`

**Files:**
- Modify: `lib/ai/prompts.ts`

The current prompt mixes concerns in one unstructured block. Rewrite it as 5 clearly labelled sections. The signature gains an optional `provider` param (last position, default `undefined`).

- [ ] **Step 1: Replace the entire contents of `lib/ai/prompts.ts`**

```typescript
import type { ProjectContext } from './context'

export function buildSystemPrompt(
  context: ProjectContext,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string,
  mode: 'api' | 'simulate' = 'api',
  provider?: string,
): string {
  // [1] IDENTITY
  const identity = `Bạn là AI assistant của nhóm, project: "${context.projectName}".
Môn: ${context.subject || 'Không có'}. Deadline: ${context.deadline}. Hôm nay: ${context.today}. Còn ${context.daysRemaining} ngày.`

  // [2] MEMBERS
  const memberLines = context.members
    .map(m => `- ${m.name} (id: ${m.id})${m.role === 'owner' ? ' [nhóm trưởng]' : ''}`)
    .join('\n')
  const members = `THÀNH VIÊN:\n${memberLines}\nNGƯỜI DÙNG: ${currentUserName} (id: ${currentUserId}, vai trò: ${currentUserRole})`

  // [3] CHECKLIST
  const checklistLines = context.checklistSummary.length === 0
    ? 'Chưa có checklist item.'
    : context.checklistSummary.map(ci => {
        const icon = ci.status === 'done' ? '✓' : ci.status === 'in_progress' ? '◑' : '□'
        const warn = ci.taskCount === 0 ? ' ⚠' : ''
        return `${icon} ${ci.name} (${ci.doneTaskCount}/${ci.taskCount})${warn}`
      }).join('\n')
  const checklist = `CHECKLIST:\n${checklistLines}`

  // [4] TOOL RULES
  const toolRules = `TOOL RULES — GỌI TOOL TRƯỚC KHI TRẢ LỜI:
- Câu hỏi về đề bài / yêu cầu / tiêu chí: gọi search_documents trước.
- Câu hỏi về tasks / tiến độ: gọi read_project hoặc read_tasks_by_section.
- Câu hỏi về workload: gọi read_member_load.
- Lên kế hoạch / tạo tasks: gọi search_documents → add_section → add_task (cùng lượt).
- Chỉ trả lời ngay nếu câu hỏi chỉ về deadline, tên project, danh sách thành viên.`

  // [5] ACTION RULES
  const assignmentRules = currentUserRole === 'owner'
    ? `Phân công: dùng assign_tasks_batch, gọi read_member_load trước. Được giao cho bất kỳ ai.`
    : `Phân công: chỉ được assign cho CHÍNH MÌNH (assignee_id = "${currentUserId}"). Không giao cho người khác.`

  const actionRules = `ACTION RULES:
- NGHIÊM CẤM: viết text mô tả kế hoạch, liệt kê bước, "tôi sẽ...", "bạn nên..." — phải gọi tool ngay.
- "lên kế hoạch" / "tạo kế hoạch" / "phân tích đề" = gọi add_section + add_task ngay, không hỏi lại.
- delete_task: chỉ nhóm trưởng. update_task: nhóm trưởng hoặc người được assign.
- ${assignmentRules}`

  const base = [identity, members, checklist, toolRules, actionRules].join('\n\n')

  if (mode === 'simulate') {
    return base + `\n\nSIMULATE MODE: output tool calls as JSON at end of response inside <tool_calls>[...]</tool_calls>. Use section name (not UUID) for add_task. No fake UUIDs.`
  }

  if (provider === 'groq') {
    return base + `\n\nIMPORTANT: Respond by calling tools only. Never write a bullet-list plan or describe steps. When asked to plan/create tasks: call add_section then add_task immediately. Tool arguments must be valid JSON. Use real UUIDs from the MEMBERS list above.`
  }

  return base
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd c:\Users\Admin\Uni\grouply
npx tsc --noEmit 2>&1 | Select-String "prompts"
```

Expected: no output (no errors in prompts.ts).

- [ ] **Step 3: Commit**

```powershell
git add lib/ai/prompts.ts
git commit -m "refactor: restructure buildSystemPrompt into 5 ordered blocks with provider param"
```

---

### Task 2: Add English tool description overrides in `lib/ai/groq.ts`

**Files:**
- Modify: `lib/ai/groq.ts`

Add `GROQ_TOOL_DESC_OVERRIDES` constant and update `toGroqTools()` to merge descriptions. No schema changes needed.

- [ ] **Step 1: Add `GROQ_TOOL_DESC_OVERRIDES` constant after the `WRITE_TOOLS` set**

Open `lib/ai/groq.ts`. After line 17 (end of `WRITE_TOOLS` block), add:

```typescript
const GROQ_TOOL_DESC_OVERRIDES: Record<string, string> = {
  search_documents:   'Search project documents for requirements, criteria, member count. Call FIRST before planning.',
  add_section:        'Create a project phase/section. Must be called BEFORE add_task.',
  add_task:           'Create a task inside a section. Requires section name or section_id.',
  assign_tasks_batch: 'Assign tasks to members. Comma-separated UUIDs in task_ids field.',
  read_project:       'Get all tasks, sections, members. Call when asked about progress.',
  read_member_load:   'Get per-member workload. Call before assigning tasks.',
  update_task:        'Update a task field. Requires task_id.',
  delete_task:        'Delete a task. Owner only.',
  read_task:          'Get details of one task by task_id.',
  read_tasks_by_section: 'List tasks filtered by section or status.',
  add_checklist_item: 'Add a deliverable item to the checklist.',
  link_task_to_item:  'Link a task to a checklist item.',
  set_dependency:     'Set a task as blocked by another task.',
  remove_dependency:  'Remove a task dependency.',
}
```

- [ ] **Step 2: Update `toGroqTools()` to use description overrides**

Replace the existing `toGroqTools` function:

```typescript
function toGroqTools(): ChatCompletionTool[] {
  return TOOL_DEFINITIONS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: GROQ_TOOL_DESC_OVERRIDES[t.name] ?? t.description,
      parameters: (GROQ_TOOL_OVERRIDES[t.name] ?? t.input_schema) as Record<string, unknown>,
    },
  }))
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npx tsc --noEmit 2>&1 | Select-String "groq"
```

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add lib/ai/groq.ts
git commit -m "feat: add English tool description overrides for Groq/Llama"
```

---

### Task 3: Pass `provider` to `buildSystemPrompt` in `app/api/ai/chat/route.ts`

**Files:**
- Modify: `app/api/ai/chat/route.ts`

Currently `buildSystemPrompt` is called without `provider`. One line change.

- [ ] **Step 1: Update the `buildSystemPrompt` call**

Find this line in `app/api/ai/chat/route.ts` (around line 46):

```typescript
const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id)
```

Replace with:

```typescript
const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id, 'api', provider)
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npx tsc --noEmit 2>&1 | Select-String "route"
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add app/api/ai/chat/route.ts
git commit -m "feat: pass provider to buildSystemPrompt for Groq suffix injection"
```

---

### Task 4: Manual smoke test

**Files:** none (test only)

No automated test framework exists for prompt output. Verify behavior manually via the dev server.

- [ ] **Step 1: Start the dev server**

```powershell
npm run dev
```

- [ ] **Step 2: Test Groq tool-calling — "lên kế hoạch"**

1. Open the app in browser at `http://localhost:3000`
2. Navigate to any project
3. Select **Groq** provider in ChatPanel
4. Type: `lên kế hoạch cho bài tập này`
5. Expected: AI calls `search_documents` (shows "tool_running"), then queues `add_section` + `add_task` as write_tools → ActionPreviewCard appears
6. NOT expected: AI responds with a bullet list of steps

- [ ] **Step 3: Test Anthropic not regressed**

1. Switch to **Claude** provider
2. Type: `lên kế hoạch cho bài tập này`  
3. Expected: same behavior — tool calls, ActionPreviewCard, no text plan

- [ ] **Step 4: Test question path not broken**

1. With Groq selected, type: `bài tập này cần mấy người?`
2. Expected: AI calls `search_documents`, returns a text answer with the number — no write_tools event

- [ ] **Step 5: Test no 413 error**

1. Send 6+ messages with Groq to build up conversation history
2. Expected: no 413 token overflow error

- [ ] **Step 6: Commit if all pass**

```powershell
git add -A
git commit -m "test: verify prompt redesign smoke tests pass"
```

(Skip this commit if no files changed during testing.)
