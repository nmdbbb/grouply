# Prompt System Redesign

## Goal

Restructure the AI system prompt and Groq tool definitions to improve tool-calling reliability (AI calls `add_section`/`add_task` instead of describing a text plan) while reducing token usage by ~35% to stay within Groq's 12k TPM free-tier limit.

## Background & Problems

Current `buildSystemPrompt` has these issues:
1. **Mixed concerns** — identity, tool routing, permission rules, checklist all in one unstructured block
2. **Verbose CONTEXT TOOL USAGE section** — long, redundant with actual tool descriptions
3. **Groq gets same prompt as Anthropic** — Llama is trained primarily on English; Vietnamese tool rules reduce compliance
4. **No provider-specific tool descriptions** — `tools.ts` descriptions are Vietnamese; Llama ignores or misreads them
5. **Token overflow** — system prompt + 6-turn history + tool defs regularly hits 13k+ tokens against 12k limit

## Approach: Prompt Restructure (Approach A)

Single `buildSystemPrompt` function, restructured into 5 ordered blocks. Optional `provider` param appends a Groq-specific suffix. English tool description overrides added in `groq.ts`.

## Files Changed

- **`lib/ai/prompts.ts`** — restructure into 5 blocks, add `provider?` param + Groq suffix
- **`lib/ai/groq.ts`** — add `GROQ_TOOL_DESC_OVERRIDES`, merge into `toGroqTools()`; remove unnecessary empty-schema overrides

## Design

### 1. System Prompt Structure (5 blocks)

```
[1] IDENTITY
  - AI role, project name, subject, deadline, today, days remaining

[2] MEMBERS
  - name (id) — owner flagged
  - current user: name, id, role

[3] CHECKLIST STATUS
  - icon + name + (done/total) per item

[4] TOOL RULES
  - when to call which tool
  - mandatory order: search_documents → add_section → add_task
  - multi-tool allowed in one turn

[5] ACTION RULES
  - NGHIÊM CẤM: text plans, bullet steps, "tôi sẽ..."
  - write vs read tool distinction
  - permission rules (owner vs member)
  - assignment rules
```

**Groq suffix** (appended when `provider === 'groq'`):
```
IMPORTANT: Respond by calling tools only. Never write a bullet-list plan or describe steps.
When asked to plan/create tasks: call add_section then add_task immediately.
Tool arguments must be valid JSON. Use real UUIDs from the MEMBERS list above.
```

### 2. Prompt Signature Change

```typescript
// Before
buildSystemPrompt(context, name, role, userId, mode?)

// After
buildSystemPrompt(context, name, role, userId, mode?, provider?)
```

`route.ts` passes `provider` when calling `buildSystemPrompt`. Groq suffix is appended inside the function when `provider === 'groq'` and `mode !== 'simulate'`.

### 3. Groq English Tool Description Overrides

Added to `groq.ts` as `GROQ_TOOL_DESC_OVERRIDES`:

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
}
```

`toGroqTools()` merges description override:
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

### 4. Remove Unnecessary Groq Schema Overrides

`read_project` and `read_member_load` currently have empty-object schema overrides `{ type: 'object', properties: {}, required: [] }`. These are identical to removing `project_id` from the original schema. Since the fix for these was to strip the `project_id` parameter (AI was passing garbage values), the cleaner fix is to keep the override but add a comment explaining why rather than removing it.

### 5. Token Budget

| Component | Before | After |
|-----------|--------|-------|
| System prompt | ~800 tokens | ~500 tokens |
| Tool definitions | ~600 tokens | ~600 tokens |
| History (6 turns) | varies | varies |
| Tool results | unbounded | capped 3000 chars |
| **Margin at 12k TPM** | **overflow** | **~3k buffer** |

Reduction achieved by:
- Removing redundant CONTEXT TOOL USAGE paragraph
- Shorter TOOL RULES (one line per tool instead of 3)
- Tighter ACTION RULES (NGHIÊM CẤM in one sentence)

### 6. Unchanged

- `lib/ai/tools.ts` — Vietnamese descriptions remain for Anthropic
- `lib/ai/execute.ts` — no changes
- `lib/ai/context.ts` — no changes
- `app/api/ai/chat/route.ts` — only passes `provider` to `buildSystemPrompt`
- `components/chat/ChatPanel.tsx` — no changes

## Success Criteria

1. Groq calls `add_section` + `add_task` (or queues them as write_tools) when user says "lên kế hoạch" — no text plan response
2. System prompt token count ≤ 550 tokens (measurable via `tiktoken` or Groq usage response)
3. Anthropic path behavior unchanged — existing read/write tool flow unaffected
4. No 413 token overflow errors under normal 6-turn conversation
