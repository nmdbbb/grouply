# Grouply — Surgical Deep Refactor Design

**Date:** 2026-05-27  
**Scope:** Code quality, type safety, architecture / separation of concerns  
**Approach:** A — Surgical Deep Refactor  
**Constraint:** No changes to external interfaces (API route signatures, Supabase schema, UI props from page.tsx down)

---

## 1. Goals

- Eliminate duplicated constants (`WRITE_TOOLS`, tool descriptions, magic numbers)
- Split oversized files into single-responsibility modules
- Fix type fragility between vector and hybrid search results
- Remove dead code (`parse_brief` tool)
- Establish explicit error handling — no silent `catch` that swallows failures
- Make each file understandable without reading its dependencies' internals

## 2. File Structure After Refactor

```
lib/
  ai/
    constants.ts              NEW — single source of truth for all constants
    prompts.ts                keep interface, refactor internals
    chunker.ts                keep, use constants from constants.ts
    retrieval.ts              fix RetrievedChunk type
    simulate.ts               remove duplicate tool list, use constants.ts + definitions.ts

    tools/
      index.ts                NEW — re-export all tools (backward compat for route.ts)
      definitions.ts          NEW — all Zod schemas (moved from tools.ts)
      dispatcher.ts           NEW — switch routing (extracted from execute.ts)
      search.ts               NEW — search_documents handler
      task.ts                 NEW — add_task, update_task, delete_task, assign_tasks_batch
      section.ts              NEW — add_section
      checklist.ts            NEW — add_checklist_item, link_task_to_item
      dependency.ts           NEW — set_dependency, remove_dependency
      project.ts              NEW — read_project, read_task, read_member_load, read_tasks_by_section

    pipeline/
      index.ts                NEW — re-export
      messageAdapter.ts       NEW — convertToModelMessages, message format utils (from route.ts lines 56–84)
      sectionResolver.ts      NEW — resolveSectionId (deduplicated from execute.ts)

lib/
  chat/
    messageUtils.ts           NEW — getMessageText, isWriteToolCall (from ChatPanel.tsx)

components/
  workspace/
    WorkspaceData.tsx         NEW — data loading, reloadData, Supabase subscriptions, brief logic
    WorkspaceLayout.tsx       NEW — layout shell: header, tabs, pane structure
  WorkspaceClient.tsx         REPLACED by workspace/ (or becomes thin wrapper)

  chat/
    ChatPanel.tsx             SHRUNK to orchestrator (~80 lines)
    ChatMessages.tsx          NEW — message list rendering
    ChatInput.tsx             NEW — textarea, send, file attach, mode switcher

types/
  index.ts                    add discriminated union for RetrievedChunk
```

**Files deleted / emptied:**
- `lib/ai/execute.ts` — logic moves to `tools/dispatcher.ts` + domain handlers
- `lib/ai/tools.ts` — content moves to `tools/definitions.ts` + `tools/index.ts`

---

## 3. Type System

### 3.1 RetrievedChunk (types/index.ts)

Replace fragile single interface with discriminated union:

```typescript
type RetrievedChunk =
  | { source: 'vector'; similarity: number; content: string; document_name: string; chunk_index: number }
  | { source: 'hybrid'; combined_score: number; content: string; document_name: string; chunk_index: number }

function getChunkScore(chunk: RetrievedChunk): number {
  return chunk.source === 'vector' ? chunk.similarity : chunk.combined_score
}
```

`retrieval.ts` tags results with `source` before returning. All consumers use `getChunkScore()` — no field-name guessing.

### 3.2 Constants (lib/ai/constants.ts)

```typescript
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
  'add_task', 'update_task', 'delete_task',
  'add_section', 'add_checklist_item',
  'link_task_to_item', 'set_dependency',
  'remove_dependency', 'assign_tasks_batch',
])
```

`simulate.ts`, `SimulateModal.tsx`, `tools/index.ts` all import from here — no more three-way duplication.

---

## 4. Data Flow (unchanged externally)

```
User message
  → ChatPanel.tsx (orchestrator)
  → POST /api/ai/chat
  → pipeline/messageAdapter.ts   format UIMessage[] → CoreMessage[]
  → lib/ai/prompts.ts            build system prompt
  → Vercel AI SDK streamText     Claude / Groq
  → onStepFinish callback
  → tools/dispatcher.ts          route tool name → domain handler
  → tools/[domain].ts            execute, return result
  → stream response back to client
```

**Key changes inside the flow:**
- `messageAdapter.ts` replaces inline format logic at route.ts:56–84
- `dispatcher.ts` replaces the 12-case switch in execute.ts
- `sectionResolver.ts` is called by `task.ts` and `section.ts` — no more copy-paste

---

## 5. Error Handling

**Rule:** No silent `catch {}` or `catch { return [] }`. Every catch must either re-throw with context or log + fall back explicitly.

### Patterns

**Fallback with logging (search):**
```typescript
// tools/search.ts
try {
  return await hybridSearchChunks(projectId, query, TOP_K_RESULTS)
} catch (err) {
  console.error('[search_documents] hybrid failed, falling back to vector:', err)
  return await searchDocuments(projectId, query, TOP_K_RESULTS)
}
```

**Throw with context (message adapter):**
```typescript
// pipeline/messageAdapter.ts
function convertMessages(messages: UIMessage[]): CoreMessage[] {
  // throws ConversionError with original message index on failure
  // route.ts wraps in try/catch → returns 500 with structured message
}
```

**Background fire-and-forget (upload-doc):**
- Keep non-blocking pattern (don't await embedding in response)
- Add structured log: `[embed] projectId=X docId=Y status=failed error=<msg>`
- No retry added (requires queue infrastructure — out of scope)

---

## 6. Component Split

### WorkspaceClient.tsx (260 lines → 2 files)

**WorkspaceData.tsx** — data layer only:
- `reloadData()`: fetch sections + tasks
- Supabase real-time subscriptions (setup + cleanup)
- localStorage brief extraction
- Renders nothing — passes data via props or context

**WorkspaceLayout.tsx** — presentation only:
- Header, view tabs, pane structure (resizable divider)
- Renders `ChecklistSidebar`, graph/list/timeline/docs view, `ChatPanel`
- `ContributionBar`, `TaskDrawer`
- No fetch calls

**WorkspaceClient.tsx** becomes a thin wrapper that composes the two (or is deleted if page.tsx can import them directly).

### ChatPanel.tsx (237 lines → 3 files)

**ChatPanel.tsx** (~80 lines, orchestrator):
- `useChat` hook, `useChatStore`
- Event handlers: `handleSend`, `handleKeyDown`, `handleCommit`
- Composes `ChatMessages` + `ChatInput`

**ChatMessages.tsx** — pure display:
- Maps `messages` → `<Message>` components
- `ActionPreviewCard` for pending tool calls
- Streaming indicator

**ChatInput.tsx** — input area:
- `<textarea>` with keyboard handler
- `FileAttachButton`, `ReplyBar`
- Provider/mode switcher (Anthropic / Groq, API / Simulate)
- `SimulateModal` trigger

### lib/chat/messageUtils.ts

```typescript
export function getMessageText(msg: Message): string
export function isWriteToolCall(toolName: string): boolean  // uses WRITE_TOOLS from constants
```

---

## 7. Dead Code Removed

| Item | Location | Action |
|------|----------|--------|
| `parse_brief` tool | `lib/ai/tools.ts:76–84` | Delete — declared but never implemented or called |
| Duplicate `WRITE_TOOLS` | `SimulateModal.tsx:29`, `simulate.ts` | Replace with import from `constants.ts` |
| Duplicate tool descriptions | `simulate.ts:32–46` | Replace with import from `tools/definitions.ts` |

---

## 8. What Does NOT Change

- Supabase schema, RPC function signatures
- `POST /api/ai/chat` request/response shape
- `POST /api/project/upload-doc` request/response shape
- Tool names and Zod input schemas
- UI props visible from `app/project/[id]/page.tsx`
- Auth and BYOK key decryption logic
- `lib/ai/prompts.ts` external interface (`buildSystemPrompt` signature)
- `stores/chatStore.ts` — already clean, no changes

---

## 9. Success Criteria

- [ ] No file in `lib/ai/tools/` exceeds 120 lines
- [ ] `WRITE_TOOLS` constant exists in exactly one place
- [ ] `RetrievedChunk` discriminated union — TypeScript catches `similarity` vs `combined_score` misuse at compile time
- [ ] `parse_brief` tool gone — no references remain
- [ ] All `catch` blocks either re-throw or log with `[module]` prefix
- [ ] `WorkspaceClient.tsx` reduced to ≤50 lines (thin wrapper)
- [ ] `ChatPanel.tsx` reduced to ≤90 lines (orchestrator only)
- [ ] `lib/ai/execute.ts` deleted (all logic moved to `tools/`)
- [ ] `lib/ai/tools.ts` deleted (all content moved to `tools/`)
- [ ] App builds with `next build` — no TypeScript errors
