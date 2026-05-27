# Grouply Surgical Deep Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Grouply's lib/ai and UI layers into single-responsibility modules, eliminate duplicated constants, fix type fragility, and remove dead code — without changing any external API or Supabase interface.

**Architecture:** Extract `lib/ai/constants.ts` as the single source of truth for all magic values; split `execute.ts` (269 lines) and `tools.ts` (178 lines) into a `lib/ai/tools/` domain-per-file structure; extract message formatting into `lib/ai/pipeline/`; split `WorkspaceClient.tsx` and `ChatPanel.tsx` into data/presentation layers.

**Tech Stack:** Next.js 16, TypeScript, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`), Supabase, Zod, Zustand, Tailwind CSS.

---

## Task 1: Create `lib/ai/constants.ts` — single source of truth

**Files:**
- Create: `lib/ai/constants.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/ai/constants.ts

export const CHUNK_SIZE = 500
export const CHUNK_OVERLAP = 80
export const MIN_CHUNK_LENGTH = 20
export const TOP_K_RESULTS = 5
export const TASK_POSITION_TOP = 20
export const TASK_POSITION_GAP = 80
export const MESSAGE_HISTORY_LIMIT = 12
export const HYBRID_VECTOR_WEIGHT = 0.7
export const HYBRID_TEXT_WEIGHT = 0.3

export const WRITE_TOOLS = new Set([
  'add_task',
  'update_task',
  'delete_task',
  'add_section',
  'add_checklist_item',
  'link_task_to_item',
  'set_dependency',
  'remove_dependency',
  'assign_tasks_batch',
])

export const SECTION_COLORS = [
  '#EEEDFE', '#FEF3C7', '#D1FAE5', '#FEE2E2',
  '#DBEAFE', '#F3E8FF', '#ECFDF5', '#FFF7ED',
]
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/constants.ts
git commit -m "feat: add lib/ai/constants.ts as single source of truth"
```

---

## Task 2: Fix `types/index.ts` — discriminated union for `RetrievedChunk`

**Files:**
- Modify: `types/index.ts`

The current `RetrievedChunk` interface in `lib/ai/retrieval.ts` has `similarity: number` but the hybrid search function returns `combined_score` instead — TypeScript can't catch misuse. We add a discriminated union and normalizer to `types/index.ts`.

- [ ] **Step 1: Add `RetrievedChunk` types to `types/index.ts`**

Open `types/index.ts`. After the last export (line 115), append:

```typescript
export type VectorChunk = {
  source: 'vector'
  similarity: number
  content: string
  document_name: string
  chunk_index: number
  doc_type?: string
  metadata?: Record<string, unknown>
}

export type HybridChunk = {
  source: 'hybrid'
  combined_score: number
  content: string
  document_name: string
  chunk_index: number
  doc_type?: string
  metadata?: Record<string, unknown>
}

export type RetrievedChunk = VectorChunk | HybridChunk

export function getChunkScore(chunk: RetrievedChunk): number {
  return chunk.source === 'vector' ? chunk.similarity : chunk.combined_score
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add discriminated union RetrievedChunk to types"
```

---

## Task 3: Update `lib/ai/retrieval.ts` — use new types, fix silent error handling

**Files:**
- Modify: `lib/ai/retrieval.ts`

Replace the entire file content. Key changes:
- Remove local `RetrievedChunk` interface (now in `types/`)
- Tag vector results with `source: 'vector'`
- Tag hybrid results with `source: 'hybrid'`
- `hybridSearchChunks` now throws instead of silently returning `[]`, and uses constants

- [ ] **Step 1: Replace `lib/ai/retrieval.ts`**

```typescript
import { embedQuery } from './embed'
import { TOP_K_RESULTS, HYBRID_VECTOR_WEIGHT, HYBRID_TEXT_WEIGHT } from './constants'
import type { RetrievedChunk, VectorChunk, HybridChunk } from '@/types'

export type { RetrievedChunk }

export async function searchDocuments(
  query: string,
  projectId: string,
  supabase: any,
  topK = TOP_K_RESULTS,
  docType?: string | null
): Promise<VectorChunk[]> {
  const queryVec = await embedQuery(query)

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryVec,
    match_project_id: projectId,
    match_count: topK,
    filter_doc_type: docType ?? null,
  })

  if (error) throw new Error(`[retrieval] vector search failed: ${error.message}`)

  return (data ?? []).map((row: any): VectorChunk => ({
    source: 'vector',
    content: row.content,
    document_name: row.document_name,
    chunk_index: row.chunk_index,
    similarity: row.similarity,
    doc_type: row.doc_type,
    metadata: row.metadata,
  }))
}

export async function hybridSearchChunks(
  query: string,
  projectId: string,
  supabase: any,
  options?: {
    matchCount?: number
    docType?: 'project_doc' | 'activity_log' | null
    vectorWeight?: number
    textWeight?: number
  }
): Promise<HybridChunk[]> {
  const queryVec = await embedQuery(query)

  const { data, error } = await supabase.rpc('hybrid_search_chunks', {
    query_embedding: queryVec,
    query_text: query,
    match_project_id: projectId,
    match_count: options?.matchCount ?? TOP_K_RESULTS,
    filter_doc_type: options?.docType ?? null,
    vector_weight: options?.vectorWeight ?? HYBRID_VECTOR_WEIGHT,
    text_weight: options?.textWeight ?? HYBRID_TEXT_WEIGHT,
  })

  if (error) throw new Error(`[retrieval] hybrid search failed: ${error.message}`)

  return (data ?? []).map((row: any): HybridChunk => ({
    source: 'hybrid',
    content: row.content,
    document_name: row.document_name,
    chunk_index: row.chunk_index,
    combined_score: row.combined_score,
    doc_type: row.doc_type,
    metadata: row.metadata,
  }))
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/retrieval.ts
git commit -m "refactor: tag RetrievedChunk with source, throw on search error"
```

---

## Task 4: Update `lib/ai/chunker.ts` — use constants

**Files:**
- Modify: `lib/ai/chunker.ts`

Replace magic numbers with imports from `constants.ts`.

- [ ] **Step 1: Update `lib/ai/chunker.ts`**

Replace the top two lines:

```typescript
// Before:
const CHUNK_SIZE = 500   // characters (không phải tokens, đủ nhỏ cho embed)
const OVERLAP = 80
```

```typescript
// After:
import { CHUNK_SIZE, CHUNK_OVERLAP, MIN_CHUNK_LENGTH } from './constants'
const OVERLAP = CHUNK_OVERLAP
```

Then replace the `filter(c => c.length > 20)` line:

```typescript
// Before:
    .filter(c => c.length > 20)
```

```typescript
// After:
    .filter(c => c.length > MIN_CHUNK_LENGTH)
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/chunker.ts
git commit -m "refactor: chunker uses constants instead of magic numbers"
```

---

## Task 5: Create `lib/ai/tools/` — domain tool handlers

This is the biggest task. We split `lib/ai/execute.ts` (269 lines) and `lib/ai/tools.ts` (178 lines) into focused domain files. All files go under `lib/ai/tools/`.

**Files:**
- Create: `lib/ai/tools/project.ts`
- Create: `lib/ai/tools/search.ts`
- Create: `lib/ai/tools/task.ts`
- Create: `lib/ai/tools/section.ts`
- Create: `lib/ai/tools/checklist.ts`
- Create: `lib/ai/tools/dependency.ts`
- Create: `lib/ai/tools/sectionResolver.ts`

### Step 5a — `lib/ai/tools/sectionResolver.ts`

This utility is called by both `task.ts` and `section.ts` to convert a section name → id.

- [ ] **Step 5a: Create `lib/ai/tools/sectionResolver.ts`**

```typescript
export async function resolveSectionId(
  sectionIdOrNull: string | null | undefined,
  sectionName: string | undefined,
  projectId: string,
  supabase: any
): Promise<string | null> {
  if (sectionIdOrNull) return sectionIdOrNull
  if (!sectionName) return null
  const { data } = await supabase
    .from('sections')
    .select('id')
    .eq('project_id', projectId)
    .ilike('name', `%${sectionName}%`)
    .limit(1)
  return data?.[0]?.id ?? null
}
```

### Step 5b — `lib/ai/tools/project.ts`

- [ ] **Step 5b: Create `lib/ai/tools/project.ts`**

```typescript
import { buildProjectContext } from '../context'
import type { ToolResult } from './types'

export async function handleReadProject(projectId: string): Promise<ToolResult> {
  const context = await buildProjectContext(projectId)
  return { toolName: 'read_project', result: context }
}

export async function handleReadTask(input: Record<string, unknown>, projectId: string, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url), claims:task_claims(*, profile:profiles(id, name, avatar_url)), documents:task_documents(*)')
    .eq('id', input.task_id as string)
    .eq('project_id', projectId)
    .single()
  return { toolName: 'read_task', result: data }
}

export async function handleReadMemberLoad(projectId: string, supabase: any): Promise<ToolResult> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('assignee_id, status, name, id')
    .eq('project_id', projectId)
    .in('status', ['todo', 'doing', 'review'])
  const { data: members } = await supabase
    .from('project_members')
    .select('*, profile:profiles(id, name)')
    .eq('project_id', projectId)
  const load = (members ?? []).map((m: any) => {
    const memberId = m.profile?.id
    const memberTasks = (tasks ?? []).filter((t: any) => t.assignee_id === memberId)
    return {
      memberId,
      memberName: m.profile?.name,
      tasks_doing: memberTasks.filter((t: any) => t.status === 'doing' || t.status === 'review'),
      tasks_todo: memberTasks.filter((t: any) => t.status === 'todo'),
      total_load_count: memberTasks.length,
    }
  })
  return { toolName: 'read_member_load', result: load }
}

export async function handleReadTasksBySection(input: Record<string, unknown>, projectId: string, supabase: any): Promise<ToolResult> {
  let query = supabase
    .from('tasks')
    .select('id, name, status, type, assignee_id, section_id, deadline, is_optional, assignee:profiles!tasks_assignee_id_fkey(id, name), section:sections(id, name)')
    .eq('project_id', projectId)
  if (input.section_id) query = query.eq('section_id', input.section_id as string)
  if (input.status) query = query.eq('status', input.status as string)
  const { data } = await query.order('created_at')
  return { toolName: 'read_tasks_by_section', result: data ?? [] }
}
```

### Step 5c — `lib/ai/tools/search.ts`

- [ ] **Step 5c: Create `lib/ai/tools/search.ts`**

```typescript
import { searchDocuments, hybridSearchChunks } from '../retrieval'
import { TOP_K_RESULTS } from '../constants'
import { getChunkScore } from '@/types'
import type { RetrievedChunk } from '@/types'
import type { ToolResult } from './types'

export async function handleSearchDocuments(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const { query, doc_type, use_hybrid = false, match_count = TOP_K_RESULTS } = input as {
    query: string
    doc_type?: 'project_doc' | 'activity_log'
    use_hybrid?: boolean
    match_count?: number
  }

  let results: RetrievedChunk[]

  if (use_hybrid) {
    try {
      results = await hybridSearchChunks(query, projectId, supabase, {
        matchCount: match_count,
        docType: doc_type ?? null,
      })
    } catch (err) {
      console.error('[search_documents] hybrid failed, falling back to vector:', err)
      results = await searchDocuments(query, projectId, supabase, match_count, doc_type ?? null)
    }
  } else {
    results = await searchDocuments(query, projectId, supabase, match_count, doc_type ?? null)
  }

  if (!results.length) {
    return {
      toolName: 'search_documents',
      result: doc_type === 'activity_log'
        ? 'Chưa có lịch sử hoạt động nào được ghi lại.'
        : 'Không tìm thấy nội dung liên quan trong tài liệu.',
    }
  }

  const label = (r: RetrievedChunk) =>
    r.doc_type === 'activity_log'
      ? '[activity_log]'
      : `[${(r.metadata as any)?.sub_type ?? 'project_doc'}] ${r.document_name}`

  const formatted = results
    .map((r, i) => `[${i + 1}] ${label(r)} (score: ${(getChunkScore(r) * 100).toFixed(0)}%)\n${r.content}`)
    .join('\n---\n')

  return { toolName: 'search_documents', result: formatted }
}
```

### Step 5d — `lib/ai/tools/task.ts`

- [ ] **Step 5d: Create `lib/ai/tools/task.ts`**

```typescript
import { resolveSectionId } from './sectionResolver'
import { TASK_POSITION_TOP, TASK_POSITION_GAP } from '../constants'
import type { ToolResult } from './types'

export async function handleAddTask(
  input: Record<string, unknown>,
  projectId: string,
  userId: string,
  supabase: any
): Promise<ToolResult> {
  const sectionId = await resolveSectionId(
    input.section_id as string | null,
    input.section as string | undefined,
    projectId,
    supabase
  )

  let posX = (input.pos_x as number) || 20
  let posY = (input.pos_y as number) || TASK_POSITION_TOP
  if (!input.pos_x && !input.pos_y && sectionId) {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', sectionId)
    posY = TASK_POSITION_TOP + (count ?? 0) * TASK_POSITION_GAP
  }

  const { data } = await supabase.from('tasks').insert({
    project_id: projectId,
    section_id: sectionId,
    name: (input.name ?? input.title) as string,
    description: (input.description as string) || null,
    type: (input.type as string) || 'output',
    checklist_item_id: (input.checklist_item_id as string) || null,
    blocked_by_id: (input.blocked_by_id as string) || null,
    deadline: (input.deadline as string) || (input.due as string) || null,
    assignee_id: (input.assignee_id as string) || null,
    pos_x: posX,
    pos_y: posY,
    created_by: userId,
  }).select().single()

  return { toolName: 'add_task', result: data }
}

export async function handleUpdateTask(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const fields = input.fields as Record<string, unknown>
  const { data } = await supabase
    .from('tasks')
    .update(fields)
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'update_task', result: data }
}

export async function handleDeleteTask(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  await supabase.from('tasks').delete().eq('id', input.task_id as string)
  return { toolName: 'delete_task', result: { success: true } }
}

export async function handleAssignTasksBatch(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const assignments = input.assignments as { task_id: string; assignee_id: string }[]
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { toolName: 'assign_tasks_batch', result: null, error: 'assignments must be a non-empty array' }
  }
  const results = await Promise.all(
    assignments.map(({ task_id, assignee_id }) =>
      supabase.from('tasks')
        .update({ assignee_id })
        .eq('id', task_id)
        .eq('project_id', projectId)
        .select('id, name, assignee_id')
        .single()
    )
  )
  const errors = results.filter((r: any) => r.error).map((r: any) => r.error?.message)
  if (errors.length > 0) return { toolName: 'assign_tasks_batch', result: null, error: errors.join('; ') }
  return { toolName: 'assign_tasks_batch', result: results.map((r: any) => r.data) }
}
```

### Step 5e — `lib/ai/tools/section.ts`

- [ ] **Step 5e: Create `lib/ai/tools/section.ts`**

```typescript
import { SECTION_COLORS } from '../constants'
import type { ToolResult } from './types'

export async function handleAddSection(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const { data: existing } = await supabase
    .from('sections')
    .select('id')
    .eq('project_id', projectId)
  const color = (input.color as string) || SECTION_COLORS[(existing?.length ?? 0) % SECTION_COLORS.length]
  const { data } = await supabase.from('sections').insert({
    project_id: projectId,
    name: input.name as string,
    color,
    ord: existing?.length ?? 0,
  }).select().single()
  return { toolName: 'add_section', result: data }
}
```

### Step 5f — `lib/ai/tools/checklist.ts`

- [ ] **Step 5f: Create `lib/ai/tools/checklist.ts`**

```typescript
import type { ToolResult } from './types'

export async function handleAddChecklistItem(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const { data: existing } = await supabase
    .from('checklist_items')
    .select('id')
    .eq('project_id', projectId)
  const { data } = await supabase.from('checklist_items').insert({
    project_id: projectId,
    name: input.name as string,
    description: (input.description as string) || null,
    ord: existing?.length ?? 0,
  }).select().single()
  return { toolName: 'add_checklist_item', result: data }
}

export async function handleLinkTaskToItem(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .update({ checklist_item_id: input.checklist_item_id as string })
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'link_task_to_item', result: data }
}
```

### Step 5g — `lib/ai/tools/dependency.ts`

- [ ] **Step 5g: Create `lib/ai/tools/dependency.ts`**

```typescript
import type { ToolResult } from './types'

export async function handleSetDependency(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .update({ blocked_by_id: input.blocked_by_id as string })
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'set_dependency', result: data }
}

export async function handleRemoveDependency(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .update({ blocked_by_id: null })
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'remove_dependency', result: data }
}
```

### Step 5h — `lib/ai/tools/types.ts`

- [ ] **Step 5h: Create `lib/ai/tools/types.ts`**

```typescript
export interface ToolResult {
  toolName: string
  result: unknown
  error?: string
}
```

- [ ] **Step 5i: Commit all tools/ domain files**

```bash
git add lib/ai/tools/
git commit -m "feat: extract tool domain handlers into lib/ai/tools/"
```

---

## Task 6: Create `lib/ai/tools/dispatcher.ts` — routing logic

**Files:**
- Create: `lib/ai/tools/dispatcher.ts`

This replaces the 12-case switch in `execute.ts`.

- [ ] **Step 1: Create `lib/ai/tools/dispatcher.ts`**

```typescript
import { handleSearchDocuments } from './search'
import { handleReadProject, handleReadTask, handleReadMemberLoad, handleReadTasksBySection } from './project'
import { handleAddTask, handleUpdateTask, handleDeleteTask, handleAssignTasksBatch } from './task'
import { handleAddSection } from './section'
import { handleAddChecklistItem, handleLinkTaskToItem } from './checklist'
import { handleSetDependency, handleRemoveDependency } from './dependency'
import type { ToolResult } from './types'
import type { ToolCall } from '@/stores/chatStore'

export async function executeToolCall(
  tool: ToolCall,
  projectId: string,
  userId: string,
  supabase: any
): Promise<ToolResult> {
  const { name, input } = tool
  try {
    switch (name) {
      case 'search_documents':   return await handleSearchDocuments(input, projectId, supabase)
      case 'read_project':       return await handleReadProject(projectId)
      case 'read_task':          return await handleReadTask(input, projectId, supabase)
      case 'read_member_load':   return await handleReadMemberLoad(projectId, supabase)
      case 'read_tasks_by_section': return await handleReadTasksBySection(input, projectId, supabase)
      case 'add_task':           return await handleAddTask(input, projectId, userId, supabase)
      case 'update_task':        return await handleUpdateTask(input, supabase)
      case 'delete_task':        return await handleDeleteTask(input, supabase)
      case 'add_section':        return await handleAddSection(input, projectId, supabase)
      case 'add_checklist_item': return await handleAddChecklistItem(input, projectId, supabase)
      case 'link_task_to_item':  return await handleLinkTaskToItem(input, supabase)
      case 'set_dependency':     return await handleSetDependency(input, supabase)
      case 'remove_dependency':  return await handleRemoveDependency(input, supabase)
      case 'assign_tasks_batch': return await handleAssignTasksBatch(input, projectId, supabase)
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
  userId: string,
  supabase: any
): Promise<ToolResult[]> {
  const sectionNameToId: Record<string, string> = {}
  const results: ToolResult[] = []

  for (let tc of toolCalls) {
    if (tc.name === 'add_task' && !tc.input.section_id && tc.input.section) {
      const sectionName = tc.input.section as string
      if (sectionNameToId[sectionName]) {
        tc = { ...tc, input: { ...tc.input, section_id: sectionNameToId[sectionName] } }
      }
    }

    const result = await executeToolCall(tc, projectId, userId, supabase)

    if (tc.name === 'add_section' && result.result) {
      const sec = result.result as any
      if (sec?.id && tc.input.name) {
        sectionNameToId[tc.input.name as string] = sec.id
      }
    }

    results.push(result)
  }

  return results
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/tools/dispatcher.ts
git commit -m "feat: add dispatcher.ts routing all tool calls to domain handlers"
```

---

## Task 7: Create `lib/ai/tools/definitions.ts` and `lib/ai/tools/index.ts`

**Files:**
- Create: `lib/ai/tools/definitions.ts`
- Create: `lib/ai/tools/index.ts`

`definitions.ts` holds the Zod schemas. `index.ts` is the public API that `route.ts` imports from — it re-exports everything and contains `buildTools()`.

- [ ] **Step 1: Create `lib/ai/tools/definitions.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { zodSchema } from 'ai'
import { buildProjectContext } from '../context'
import { executeToolCall } from './dispatcher'

function exec(name: string, input: Record<string, unknown>, projectId: string, userId: string, supabase: any) {
  return executeToolCall({ name, input, id: name }, projectId, userId, supabase).then(r => r.result)
}

export function buildTools(projectId: string, userId: string, supabase: any) {
  return {
    search_documents: tool({
      description: `Tìm kiếm ngữ nghĩa trong tài liệu và lịch sử hoạt động của dự án.

Hai corpus:
- doc_type="project_doc": đề bài, rubric, tài liệu tham khảo (file đã upload)
- doc_type="activity_log": lịch sử mọi hành động AI đã thực hiện trong dự án

Khi nào dùng:
- Hỏi về yêu cầu đề bài, tiêu chí chấm → doc_type="project_doc"
- Hỏi lịch sử ("AI đã làm gì?", "tại sao task này assign cho X?") → doc_type="activity_log"
- Hỏi chung không chắc loại → bỏ trống doc_type
- Query có keyword cụ thể (tên người, con số, thuật ngữ) → use_hybrid=true`,
      inputSchema: zodSchema(z.object({
        query: z.string().describe('Câu truy vấn tìm kiếm'),
        doc_type: z.enum(['project_doc', 'activity_log']).optional(),
        use_hybrid: z.boolean().optional(),
        match_count: z.number().optional(),
      })),
      execute: (input) => exec('search_documents', input as any, projectId, userId, supabase),
    }),

    read_project: tool({
      description: 'Đọc toàn bộ state của project: tasks, members, checklist items, sections.',
      inputSchema: zodSchema(z.object({ project_id: z.string().optional() })),
      execute: () => buildProjectContext(projectId),
    }),

    read_task: tool({
      description: 'Đọc chi tiết một task.',
      inputSchema: zodSchema(z.object({ task_id: z.string() })),
      execute: (input) => exec('read_task', input, projectId, userId, supabase),
    }),

    read_member_load: tool({
      description: 'Xem workload của từng thành viên.',
      inputSchema: zodSchema(z.object({})),
      execute: () => exec('read_member_load', {}, projectId, userId, supabase),
    }),

    read_tasks_by_section: tool({
      description: 'Đọc tasks của một hoặc tất cả sections.',
      inputSchema: zodSchema(z.object({
        section_id: z.string().optional(),
        status: z.enum(['todo', 'doing', 'review', 'done', 'blocked']).optional(),
      })),
      execute: (input) => exec('read_tasks_by_section', input, projectId, userId, supabase),
    }),

    add_task: tool({
      description: 'Thêm task mới vào project.',
      inputSchema: zodSchema(z.object({
        name: z.string(),
        section: z.string().optional(),
        section_id: z.string().optional(),
        type: z.enum(['output', 'coordination', 'research', 'review']),
        checklist_item_id: z.string().optional(),
        blocked_by_id: z.string().optional(),
        deadline: z.string().optional(),
        assignee_id: z.string().optional(),
        pos_x: z.number().optional(),
        pos_y: z.number().optional(),
      })),
    }),

    update_task: tool({
      description: 'Cập nhật thông tin của một task.',
      inputSchema: zodSchema(z.object({
        task_id: z.string(),
        fields: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(['todo', 'doing', 'review', 'done', 'blocked']).optional(),
          assignee_id: z.string().optional(),
          deadline: z.string().optional(),
          section_id: z.string().optional(),
          checklist_item_id: z.string().optional(),
          blocked_by_id: z.string().optional(),
          is_optional: z.boolean().optional(),
        }),
      })),
    }),

    delete_task: tool({
      description: 'Xóa task. Chỉ owner.',
      inputSchema: zodSchema(z.object({ task_id: z.string() })),
    }),

    add_section: tool({
      description: 'Thêm section mới.',
      inputSchema: zodSchema(z.object({
        name: z.string(),
        color: z.string().optional(),
      })),
    }),

    add_checklist_item: tool({
      description: 'Thêm deliverable item vào checklist.',
      inputSchema: zodSchema(z.object({
        name: z.string(),
        description: z.string().optional(),
      })),
    }),

    link_task_to_item: tool({
      description: 'Liên kết task với checklist item.',
      inputSchema: zodSchema(z.object({
        task_id: z.string(),
        checklist_item_id: z.string(),
      })),
    }),

    set_dependency: tool({
      description: 'Tạo dependency: task bị block bởi task khác.',
      inputSchema: zodSchema(z.object({
        task_id: z.string(),
        blocked_by_id: z.string(),
      })),
    }),

    remove_dependency: tool({
      description: 'Xóa dependency của task.',
      inputSchema: zodSchema(z.object({ task_id: z.string() })),
    }),

    assign_tasks_batch: tool({
      description: 'Phân công hàng loạt tasks cho các thành viên.',
      inputSchema: zodSchema(z.object({
        assignments: z.array(z.object({
          task_id: z.string(),
          assignee_id: z.string(),
        })),
      })),
    }),
  }
}
```

- [ ] **Step 2: Create `lib/ai/tools/index.ts`**

```typescript
export { buildTools } from './definitions'
export { executeToolCall, executeToolCalls } from './dispatcher'
export { WRITE_TOOLS } from '../constants'
export type { ToolResult } from './types'
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/tools/definitions.ts lib/ai/tools/index.ts
git commit -m "feat: add tools/definitions.ts and tools/index.ts"
```

---

## Task 8: Update `app/api/ai/chat/route.ts` to use new `tools/` path

**Files:**
- Modify: `app/api/ai/chat/route.ts`

The route currently imports from `lib/ai/tools` and `lib/ai/execute`. We update imports — no logic changes.

- [ ] **Step 1: Update imports in `app/api/ai/chat/route.ts`**

Replace lines 8–9:

```typescript
// Before:
import { buildTools, WRITE_TOOLS } from '@/lib/ai/tools'
import { executeToolCalls, buildGhostPreview } from '@/lib/ai/execute'
```

```typescript
// After:
import { buildTools, WRITE_TOOLS, executeToolCalls } from '@/lib/ai/tools'
import { buildGhostPreview } from '@/lib/ai/preview'
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors related to the changed imports. If errors appear, check that `lib/ai/tools/index.ts` exports match what route.ts uses.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/chat/route.ts
git commit -m "refactor: route.ts imports from lib/ai/tools/ and lib/ai/preview"
```

---

## Task 9: Delete old `lib/ai/tools.ts` and `lib/ai/execute.ts`

**Files:**
- Delete: `lib/ai/tools.ts`
- Delete: `lib/ai/execute.ts`

Before deleting, confirm nothing still imports from them.

- [ ] **Step 1: Search for remaining imports**

Run:
```bash
grep -r "from.*lib/ai/tools'" src/ app/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v "lib/ai/tools/"
grep -r "from.*lib/ai/execute" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Expected: Zero results. If any remain, update those imports to use `@/lib/ai/tools` (the new index) before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm lib/ai/tools.ts
rm lib/ai/execute.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete lib/ai/tools.ts and lib/ai/execute.ts (replaced by lib/ai/tools/)"
```

---

## Task 10: Update `lib/ai/simulate.ts` — remove duplicated tool list

**Files:**
- Modify: `lib/ai/simulate.ts`

`simulate.ts` has its own `SIMULATE_TOOL_DESCRIPTIONS` array (lines 5–21) that duplicates tool names and descriptions from `tools/definitions.ts`. Replace with a derived list from `buildTools`.

- [ ] **Step 1: Replace `lib/ai/simulate.ts`**

```typescript
import { buildSystemPrompt } from './prompts'
import type { ProjectContext } from './context'
import type { ToolCall } from '@/stores/chatStore'

const TOOL_DESCRIPTIONS: { name: string; description: string }[] = [
  { name: 'read_project', description: 'Đọc toàn bộ state của project: tasks, members, checklist items, sections.' },
  { name: 'read_task', description: 'Đọc chi tiết một task.' },
  { name: 'read_member_load', description: 'Xem workload của từng thành viên.' },
  { name: 'read_tasks_by_section', description: 'Đọc tasks của một hoặc tất cả sections.' },
  { name: 'search_documents', description: 'Tìm kiếm ngữ nghĩa trong tài liệu và lịch sử hoạt động.' },
  { name: 'add_task', description: 'Thêm task mới vào project.' },
  { name: 'update_task', description: 'Cập nhật thông tin của một task.' },
  { name: 'delete_task', description: 'Xóa task. Chỉ owner.' },
  { name: 'add_section', description: 'Thêm section mới.' },
  { name: 'add_checklist_item', description: 'Thêm deliverable item vào checklist.' },
  { name: 'link_task_to_item', description: 'Liên kết task với checklist item.' },
  { name: 'set_dependency', description: 'Tạo dependency: task bị block bởi task khác.' },
  { name: 'remove_dependency', description: 'Xóa dependency của task.' },
  { name: 'assign_tasks_batch', description: 'Phân công hàng loạt tasks cho các thành viên.' },
]

export function buildSimulatePrompt(
  context: ProjectContext,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string
): string {
  const systemPrompt = buildSystemPrompt(context, currentUserName, currentUserRole, currentUserId, 'simulate')

  const toolsDescription = TOOL_DESCRIPTIONS.map(t => `**${t.name}**: ${t.description}`).join('\n')

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
}

export function parseSimulateResponse(responseText: string): ToolCall[] {
  const xmlMatch = responseText.match(/<tool_calls>\s*([\s\S]*?)\s*<\/tool_calls>/)
  if (xmlMatch) {
    try {
      const parsed = JSON.parse(xmlMatch[1])
      if (Array.isArray(parsed)) {
        return parsed.filter(tc => typeof tc.name === 'string' && tc.input !== undefined)
      }
    } catch {}
  }

  const arrayMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) {
        return parsed.filter(tc => typeof tc.name === 'string' && tc.input !== undefined)
      }
    } catch {}
  }

  const codeMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/)
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1])
      if (Array.isArray(parsed)) {
        return parsed.filter(tc => typeof tc.name === 'string' && tc.input !== undefined)
      }
    } catch {}
  }

  return []
}
```

Note: `parse_brief` is intentionally removed from `TOOL_DESCRIPTIONS` (dead code).

- [ ] **Step 2: Commit**

```bash
git add lib/ai/simulate.ts
git commit -m "refactor: simulate.ts removes parse_brief dead code, keeps TOOL_DESCRIPTIONS inline"
```

---

## Task 11: Update `components/chat/SimulateModal.tsx` — import `WRITE_TOOLS` from constants

**Files:**
- Modify: `components/chat/SimulateModal.tsx`

- [ ] **Step 1: Replace the inline `WRITE_TOOLS` Set in `SimulateModal.tsx`**

Remove line 29:
```typescript
// Before (line 29):
  const WRITE_TOOLS = new Set(['add_task', 'update_task', 'delete_task', 'add_section', 'add_checklist_item', 'link_task_to_item', 'set_dependency', 'remove_dependency'])
```

Add import at top of file (after existing imports):
```typescript
import { WRITE_TOOLS } from '@/lib/ai/constants'
```

The `WRITE_TOOLS` usage in `handleParse()` (line 33) stays unchanged since the name is the same.

- [ ] **Step 2: Commit**

```bash
git add components/chat/SimulateModal.tsx
git commit -m "refactor: SimulateModal imports WRITE_TOOLS from constants"
```

---

## Task 12: Create `lib/chat/messageUtils.ts` and shrink `ChatPanel.tsx`

**Files:**
- Create: `lib/chat/messageUtils.ts`
- Modify: `components/chat/ChatPanel.tsx`

- [ ] **Step 1: Create `lib/chat/messageUtils.ts`**

```typescript
import { WRITE_TOOLS } from '@/lib/ai/constants'

export function getMessageText(msg: any): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.parts)) {
    return msg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
  }
  return ''
}

export function isWriteToolCall(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
}
```

- [ ] **Step 2: Update ChatPanel.tsx to import from messageUtils**

Add to imports in `ChatPanel.tsx`:
```typescript
import { getMessageText } from '@/lib/chat/messageUtils'
```

Remove the local `msgText` function (lines 103–109):
```typescript
// Delete this entire function:
  function msgText(msg: any): string {
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.parts)) {
      return msg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
    }
    return ''
  }
```

Replace all 4 calls to `msgText(m)` in the file with `getMessageText(m)`.

- [ ] **Step 3: Commit**

```bash
git add lib/chat/messageUtils.ts components/chat/ChatPanel.tsx
git commit -m "refactor: extract getMessageText to lib/chat/messageUtils"
```

---

## Task 13: Extract `ChatMessages.tsx` from `ChatPanel.tsx`

**Files:**
- Create: `components/chat/ChatMessages.tsx`
- Modify: `components/chat/ChatPanel.tsx`

- [ ] **Step 1: Create `components/chat/ChatMessages.tsx`**

```typescript
'use client'
import { useRef, useEffect } from 'react'
import { Message } from './Message'
import { ActionPreviewCard } from './ActionPreviewCard'
import { getMessageText } from '@/lib/chat/messageUtils'
import type { GhostPreview, ToolCall } from '@/stores/chatStore'

interface Props {
  messages: any[]
  isLoading: boolean
  ghostPreview: GhostPreview | null
  pendingToolCalls: ToolCall[]
  projectId: string
  onSetReplyTo: (msg: any) => void
  onCommit: () => void
  onDiscard: () => void
}

export function ChatMessages({
  messages, isLoading, ghostPreview, pendingToolCalls,
  projectId, onSetReplyTo, onCommit, onDiscard,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {messages.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground text-center mt-8">
          Hỏi AI về project, phân công task, hoặc paste đề bài để bắt đầu.
        </p>
      )}

      {messages.map((m: any) => {
        const text = getMessageText(m)
        if (!text) return null
        return (
          <Message
            key={m.id}
            message={{ id: m.id, role: m.role as 'user' | 'assistant', content: text, timestamp: new Date() }}
            onReply={onSetReplyTo}
          />
        )
      })}

      {ghostPreview && pendingToolCalls.length > 0 && (
        <ActionPreviewCard
          preview={ghostPreview}
          toolCalls={pendingToolCalls}
          projectId={projectId}
          onCommit={onCommit}
          onDiscard={onDiscard}
        />
      )}

      {isLoading && (
        <div className="flex justify-start mb-3">
          <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-muted-foreground">
            Đang suy nghĩ...
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/ChatMessages.tsx
git commit -m "feat: extract ChatMessages component"
```

---

## Task 14: Extract `ChatInput.tsx` from `ChatPanel.tsx`

**Files:**
- Create: `components/chat/ChatInput.tsx`

- [ ] **Step 1: Create `components/chat/ChatInput.tsx`**

```typescript
'use client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FileAttachButton } from './FileAttachButton'
import { ReplyBar } from './ReplyBar'

interface Props {
  input: string
  mode: 'api' | 'simulate'
  provider: 'anthropic' | 'groq'
  isLoading: boolean
  replyTo: any | null
  attachedFile: { name: string; text: string } | null
  onInputChange: (val: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onClearReply: () => void
  onClearFile: () => void
  onSetFile: (file: { name: string; text: string }) => void
  onSetProvider: (p: 'anthropic' | 'groq') => void
  onSetMode: (m: 'api' | 'simulate') => void
  onSimulateClick: () => void
}

export function ChatInput({
  input, mode, provider, isLoading,
  replyTo, attachedFile,
  onInputChange, onKeyDown, onSend,
  onClearReply, onClearFile, onSetFile,
  onSetProvider, onSetMode, onSimulateClick,
}: Props) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">AI Chat</span>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
            <button
              title="Anthropic Claude"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${provider === 'anthropic' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => onSetProvider('anthropic')}
            >Claude</button>
            <button
              title="Groq (Llama 3.3 70B)"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${provider === 'groq' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => onSetProvider('groq')}
            >Groq</button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            className={`text-xs px-2 py-1 rounded-md ${mode === 'api' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
            onClick={() => onSetMode('api')}
          >🤖 API</button>
          <button
            className={`text-xs px-2 py-1 rounded-md ${mode === 'simulate' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
            onClick={() => onSetMode('simulate')}
          >📋 Simulate</button>
        </div>
      </div>

      {/* Reply and file banners */}
      {replyTo && <ReplyBar message={replyTo} onClear={onClearReply} />}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-xs">
          <span className="text-amber-700 flex-1 truncate">📎 {attachedFile.name}</span>
          <button onClick={onClearFile} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Input row */}
      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2 items-end">
          <FileAttachButton onExtracted={onSetFile} />
          <Textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === 'simulate' ? 'Nhập câu hỏi → xuất prompt...' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button
            size="sm"
            onClick={mode === 'simulate' ? onSimulateClick : onSend}
            disabled={isLoading || !input.trim()}
            className="self-end shrink-0"
          >Gửi</Button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/ChatInput.tsx
git commit -m "feat: extract ChatInput component"
```

---

## Task 15: Rewrite `ChatPanel.tsx` as orchestrator

**Files:**
- Modify: `components/chat/ChatPanel.tsx`

Replace the entire file content with a lean orchestrator (~90 lines):

- [ ] **Step 1: Rewrite `ChatPanel.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { SimulateModal } from './SimulateModal'
import { buildSimulatePrompt } from '@/lib/ai/simulate'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import { getMessageText } from '@/lib/chat/messageUtils'
import type { ProjectContext } from '@/lib/ai/context'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'

interface Props {
  projectId: string
  context: ProjectContext
  currentUserName: string
  currentUserRole: string
  userId: string
  onAfterCommit?: () => void
}

export function ChatPanel({ projectId, context, currentUserName, currentUserRole, userId, onAfterCommit }: Props) {
  const [showSimulate, setShowSimulate] = useState(false)
  const [simulatePrompt, setSimulatePrompt] = useState('')
  const [input, setInput] = useState('')

  const {
    pendingToolCalls, ghostPreview, mode, provider,
    replyTo, attachedFile,
    setPending, clearPending, setMode, setProvider, setReplyTo, setAttachedFile,
  } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { project_id: projectId, provider, reply_to: replyTo?.content ?? null, attached_text: attachedFile?.text ?? null },
    }),
    onData: (dataPart: any) => {
      if (dataPart?.name === 'write-tools' && dataPart?.data) {
        const { tool_calls, preview } = dataPart.data as { tool_calls: ToolCall[]; preview: GhostPreview }
        setPending(tool_calls, preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(tool_calls, context)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    },
    onFinish: () => { setReplyTo(null); setAttachedFile(null) },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  function submitMessage() {
    if (!input.trim()) return
    sendMessage({ text: input })
    setInput('')
  }

  function openSimulate() {
    const history = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: getMessageText(m) }))
    setSimulatePrompt(buildSimulatePrompt(context, history, input, currentUserName, currentUserRole, userId))
    setShowSimulate(true)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (mode === 'simulate') { openSimulate(); return }
    submitMessage()
  }

  function handleSimulateParsed(toolCalls: ToolCall[], preview: GhostPreview) {
    if (toolCalls.length > 0) {
      setPending(toolCalls, preview)
      const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(toolCalls, context)
      setGhostPreview(ghostNodes, ghostEdges)
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-white">
      <ChatInput
        input={input}
        mode={mode}
        provider={provider}
        isLoading={isLoading}
        replyTo={replyTo}
        attachedFile={attachedFile}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={submitMessage}
        onClearReply={() => setReplyTo(null)}
        onClearFile={() => setAttachedFile(null)}
        onSetFile={setAttachedFile}
        onSetProvider={setProvider}
        onSetMode={setMode}
        onSimulateClick={openSimulate}
      />
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        ghostPreview={ghostPreview}
        pendingToolCalls={pendingToolCalls}
        projectId={projectId}
        onSetReplyTo={setReplyTo}
        onCommit={() => { clearPending(); clearGhost(); onAfterCommit?.() }}
        onDiscard={() => { clearPending(); clearGhost() }}
      />
      <SimulateModal
        open={showSimulate}
        prompt={simulatePrompt}
        onClose={() => setShowSimulate(false)}
        onParsed={handleSimulateParsed}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ChatPanel.tsx
git commit -m "refactor: ChatPanel is now orchestrator, delegates to ChatMessages + ChatInput"
```

---

## Task 16: Split `WorkspaceClient.tsx` into data + layout layers

**Files:**
- Create: `components/workspace/WorkspaceData.tsx`
- Create: `components/workspace/WorkspaceLayout.tsx`
- Modify: `components/WorkspaceClient.tsx`

### Step 16a — Create `WorkspaceData.tsx`

- [ ] **Step 16a: Create `components/workspace/WorkspaceData.tsx`**

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Task, Section } from '@/types'

interface DataProps {
  projectId: string
  initialSections: Section[]
  initialTasks: Task[]
  children: (data: {
    liveSections: Section[]
    liveTasks: Task[]
    pendingBrief: string | null
    reloadData: () => Promise<void>
  }) => React.ReactNode
}

export function WorkspaceData({ projectId, initialSections, initialTasks, children }: DataProps) {
  const [liveSections, setLiveSections] = useState(initialSections)
  const [liveTasks, setLiveTasks] = useState(initialTasks)
  const [pendingBrief, setPendingBrief] = useState<string | null>(null)
  const supabase = createClient()
  const searchParams = useSearchParams()

  const reloadData = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
      supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url)').eq('project_id', projectId).order('created_at'),
    ])
    if (s) setLiveSections(s as Section[])
    if (t) setLiveTasks(t as Task[])
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get('parseBrief') !== '1') return
    const brief = localStorage.getItem(`grouply-brief-${projectId}`)
    if (!brief) return
    localStorage.removeItem(`grouply-brief-${projectId}`)
    setPendingBrief(brief)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children({ liveSections, liveTasks, pendingBrief, reloadData })}</>
}
```

### Step 16b — Create `WorkspaceLayout.tsx`

- [ ] **Step 16b: Create `components/workspace/WorkspaceLayout.tsx`**

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { TaskList } from '@/components/task/TaskList'
import { InviteButton } from '@/components/project/InviteButton'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ChecklistSidebar } from '@/components/checklist/ChecklistSidebar'
import { ContributionBar } from '@/components/contribution/ContributionBar'
import { TaskDrawer } from '@/components/task/TaskDrawer'
import { DocumentsTab } from '@/components/documents/DocumentsTab'
import { ResizableDivider } from '@/components/ui/ResizableDivider'
import { TimelineView } from '@/components/timeline/TimelineView'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section, ChecklistItem, Project } from '@/types'
import type { ProjectContext } from '@/lib/ai/context'

const TaskGraph = dynamic(
  () => import('@/components/graph/TaskGraph').then(m => ({ default: m.TaskGraph })),
  { ssr: false }
)

interface Props {
  project: Project
  userId: string
  userRole: 'owner' | 'member'
  liveSections: Section[]
  liveTasks: Task[]
  initialChecklistItems: ChecklistItem[]
  members: { id: string; name: string; avatar_url: string | null; role: string }[]
  aiContext: ProjectContext
  currentUserName: string
  reloadData: () => Promise<void>
}

export function WorkspaceLayout({
  project, userId, userRole, liveSections, liveTasks,
  initialChecklistItems, members, aiContext, currentUserName, reloadData,
}: Props) {
  const [view, setView] = useState<'graph' | 'list' | 'timeline' | 'docs'>('graph')
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatWidth, setChatWidth] = useState(320)
  const router = useRouter()

  useEffect(() => setMounted(true), [])

  const resizeSidebar = useCallback((delta: number) => {
    setSidebarWidth(w => Math.max(160, Math.min(480, w + delta)))
  }, [])

  const resizeChat = useCallback((delta: number) => {
    setChatWidth(w => Math.max(240, Math.min(600, w - delta)))
  }, [])

  async function handleDeleteProject() {
    if (!confirm(`Xóa project "${project.name}"? Toàn bộ tasks, sections và dữ liệu sẽ bị xóa vĩnh viễn.`)) return
    setDeleting(true)
    const res = await fetch('/api/project/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id }),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      alert('Xóa thất bại. Thử lại.')
      setDeleting(false)
    }
  }

  const graphMembers = members.map(m => ({ id: m.id, name: m.name, avatar_url: m.avatar_url }))

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold">Grouply</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{project.name}</span>
          {project.subject && <span className="text-sm text-muted-foreground">{project.subject}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border rounded-lg overflow-hidden text-xs">
            {(['graph', 'list', 'timeline', 'docs'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium transition-colors ${view === v ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-gray-50'}`}
              >
                {v === 'graph' ? '🗺 Graph' : v === 'list' ? '☰ List' : v === 'timeline' ? '📅 Timeline' : '📁 Tài liệu'}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">Deadline: {formatDeadline(project.deadline)}</span>
          {userRole === 'owner' && <InviteButton projectId={project.id} />}
          {mounted && userRole === 'owner' && (
            <button
              onClick={handleDeleteProject}
              disabled={deleting}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
            >
              {deleting ? 'Đang xóa...' : 'Xóa project'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: sidebarCollapsed ? 32 : sidebarWidth, minWidth: sidebarCollapsed ? 32 : sidebarWidth }} className="shrink-0 overflow-hidden transition-none">
            <ChecklistSidebar
              projectId={project.id}
              initialItems={initialChecklistItems}
              initialTasks={liveTasks}
              onCollapsedChange={setSidebarCollapsed}
            />
          </div>

          {!sidebarCollapsed && <ResizableDivider onResize={resizeSidebar} />}

          {view === 'graph' && (
            <div className="flex flex-1 overflow-hidden min-w-0">
              <div className="flex-1 relative overflow-hidden min-w-0">
                <TaskGraph
                  projectId={project.id}
                  userId={userId}
                  initialTasks={liveTasks}
                  initialSections={liveSections}
                  members={graphMembers}
                  onToggleView={() => setView('list')}
                  currentView="graph"
                  onOpenDrawer={(task: Task) => { setDrawerTask(task); setDrawerOpen(true) }}
                />
              </div>
              <ResizableDivider onResize={resizeChat} />
              <div style={{ width: chatWidth, minWidth: chatWidth }} className="shrink-0 overflow-hidden">
                <ChatPanel projectId={project.id} context={aiContext} currentUserName={currentUserName} currentUserRole={userRole} userId={userId} onAfterCommit={reloadData} />
              </div>
            </div>
          )}

          {view === 'list' && (
            <div className="flex-1 overflow-auto min-w-0">
              <div className="max-w-4xl mx-auto px-6 py-6">
                <TaskList projectId={project.id} userId={userId} initialSections={liveSections} initialTasks={liveTasks} />
              </div>
            </div>
          )}

          {view === 'timeline' && (
            <div className="flex-1 overflow-hidden min-w-0">
              <TimelineView project={project} tasks={liveTasks} sections={liveSections} userId={userId} onTaskClick={(task: Task) => { setDrawerTask(task); setDrawerOpen(true) }} />
            </div>
          )}

          {view === 'docs' && (
            <div className="flex flex-1 overflow-hidden min-w-0">
              <div className="flex-1 overflow-hidden bg-gray-50 min-w-0">
                <DocumentsTab projectId={project.id} onAnalyze={() => setView('graph')} />
              </div>
              <ResizableDivider onResize={resizeChat} />
              <div style={{ width: chatWidth, minWidth: chatWidth }} className="shrink-0 overflow-hidden">
                <ChatPanel projectId={project.id} context={aiContext} currentUserName={currentUserName} currentUserRole={userRole} userId={userId} onAfterCommit={reloadData} />
              </div>
            </div>
          )}
        </div>

        <ContributionBar projectId={project.id} members={graphMembers} />
      </main>

      <TaskDrawer
        task={drawerTask}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sections={liveSections}
        checklistItems={initialChecklistItems}
        members={members.map(m => ({ ...m, role: m.role }))}
        currentUserId={userId}
        currentUserRole={userRole}
        projectId={project.id}
        onUpdated={reloadData}
        onAskAI={() => setDrawerOpen(false)}
      />
    </div>
  )
}
```

### Step 16c — Rewrite `WorkspaceClient.tsx` as thin wrapper

- [ ] **Step 16c: Rewrite `components/WorkspaceClient.tsx`**

```typescript
'use client'
import { WorkspaceData } from './workspace/WorkspaceData'
import { WorkspaceLayout } from './workspace/WorkspaceLayout'
import type { Task, Section, ChecklistItem, Project } from '@/types'
import type { ProjectContext } from '@/lib/ai/context'

interface Props {
  project: Project
  userId: string
  userRole: 'owner' | 'member'
  initialSections: Section[]
  initialTasks: Task[]
  initialChecklistItems: ChecklistItem[]
  members: { id: string; name: string; avatar_url: string | null; role: string }[]
  aiContext: ProjectContext
  currentUserName: string
}

export function WorkspaceClient(props: Props) {
  return (
    <WorkspaceData
      projectId={props.project.id}
      initialSections={props.initialSections}
      initialTasks={props.initialTasks}
    >
      {({ liveSections, liveTasks, pendingBrief: _pendingBrief, reloadData }) => (
        <WorkspaceLayout
          project={props.project}
          userId={props.userId}
          userRole={props.userRole}
          liveSections={liveSections}
          liveTasks={liveTasks}
          initialChecklistItems={props.initialChecklistItems}
          members={props.members}
          aiContext={props.aiContext}
          currentUserName={props.currentUserName}
          reloadData={reloadData}
        />
      )}
    </WorkspaceData>
  )
}
```

- [ ] **Step 16d: Commit all workspace files**

```bash
git add components/workspace/ components/WorkspaceClient.tsx
git commit -m "refactor: split WorkspaceClient into WorkspaceData + WorkspaceLayout"
```

---

## Task 17: Final verification

- [ ] **Step 1: TypeScript full check**

Run: `npx tsc --noEmit`

Expected: Zero errors.

- [ ] **Step 2: Verify no remaining references to deleted files**

```bash
grep -r "lib/ai/execute" app/ components/ lib/ --include="*.ts" --include="*.tsx"
grep -r "from.*lib/ai/tools'" app/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v "lib/ai/tools/"
grep -r "parse_brief" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Expected: All zero results.

- [ ] **Step 3: Verify WRITE_TOOLS has exactly one definition**

```bash
grep -r "WRITE_TOOLS" lib/ components/ --include="*.ts" --include="*.tsx"
```

Expected: One `export const WRITE_TOOLS` in `lib/ai/constants.ts`, and `import { WRITE_TOOLS }` everywhere else.

- [ ] **Step 4: Check success criteria from spec**

- [ ] No file in `lib/ai/tools/` exceeds 120 lines
- [ ] `WRITE_TOOLS` constant defined in exactly one place (`lib/ai/constants.ts`)
- [ ] `parse_brief` tool gone — no references remain
- [ ] `lib/ai/execute.ts` deleted
- [ ] `lib/ai/tools.ts` deleted
- [ ] `WorkspaceClient.tsx` ≤50 lines
- [ ] `ChatPanel.tsx` ≤90 lines

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: grouply surgical deep refactor complete"
```
