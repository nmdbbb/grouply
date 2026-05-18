import Groq from 'groq-sdk'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionMessageToolCall,
} from 'groq-sdk/resources/chat/completions'
import { TOOL_DEFINITIONS } from './tools'
import { executeToolCall, buildGhostPreview } from './execute'
import type { ToolCall } from '@/stores/chatStore'

const WRITE_TOOLS = new Set([
  'add_task', 'update_task', 'delete_task',
  'add_section', 'add_checklist_item',
  'link_task_to_item', 'set_dependency', 'remove_dependency',
  'assign_tasks_batch',
])

const GROQ_TOOL_DESC_OVERRIDES: Record<string, string> = {
  search_documents:      'Search project documents for requirements, criteria, member count. Call FIRST before planning.',
  add_section:           'Create a project phase/section. Must be called BEFORE add_task.',
  add_task:              'Create a task. Provide section name or section_id to place it in a section.',
  assign_tasks_batch:    'Assign tasks to members. Comma-separated UUIDs in task_ids field.',
  read_project:          'Get all tasks, sections, members. Call to inspect current project state.',
  read_member_load:      'Get per-member workload. Call before assigning tasks.',
  update_task:           'Update a task field. Requires task_id.',
  delete_task:           'Delete a task. Owner only.',
  read_task:             'Get details of one task by task_id.',
  read_tasks_by_section: 'List tasks filtered by section or status.',
  add_checklist_item:    'Add a deliverable item to the checklist.',
  link_task_to_item:     'Link a task to a checklist item.',
  set_dependency:        'Set a task as blocked by another task.',
  remove_dependency:     'Remove all dependencies from a task (requires task_id).',
}

// Flattened schemas — nested objects/arrays cause failed_generation in Llama
const GROQ_TOOL_OVERRIDES: Record<string, Record<string, unknown>> = {
  update_task: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'UUID của task cần cập nhật' },
      name: { type: 'string', description: 'Tên mới (optional)' },
      status: { type: 'string', description: 'todo | doing | review | done | blocked (optional)' },
      assignee_id: { type: 'string', description: 'UUID người được assign (optional)' },
      deadline: { type: 'string', description: 'YYYY-MM-DD (optional)' },
      description: { type: 'string', description: 'Mô tả mới (optional)' },
    },
    required: ['task_id'],
  },
  assign_tasks_batch: {
    type: 'object',
    properties: {
      task_ids: { type: 'string', description: 'UUID các task cách nhau dấu phẩy: "uuid1,uuid2"' },
      assignee_id: { type: 'string', description: 'UUID thành viên được assign' },
    },
    required: ['task_ids', 'assignee_id'],
  },
  // Remove properties that confuse the model
  read_project: {
    type: 'object',
    properties: {},
    required: [],
  },
  read_member_load: {
    type: 'object',
    properties: {},
    required: [],
  },
}

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

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    return {}
  }
}

function normalizeArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  if (toolName === 'update_task') {
    const { task_id, ...rest } = args
    return { task_id, fields: rest }
  }
  if (toolName === 'assign_tasks_batch') {
    const taskIds = String(args.task_ids ?? '').split(',').map(s => s.trim()).filter(Boolean)
    return { assignments: taskIds.map(task_id => ({ task_id, assignee_id: args.assignee_id })) }
  }
  return args
}

// Fake-stream text by sending 50-char chunks (non-streaming API call)
function fakeStreamText(text: string, send: (obj: object) => void) {
  const chunks = text.match(/[\s\S]{1,50}/g) ?? [text]
  for (const chunk of chunks) {
    send({ type: 'text_delta', text: chunk })
  }
}

export async function runGroqAgenticLoop(opts: {
  apiKey: string
  systemPrompt: string
  messages: { role: string; content: string }[]
  projectId: string
  userId: string
  supabase: any
  send: (obj: object) => void
}) {
  const { apiKey, systemPrompt, messages, projectId, userId, supabase, send } = opts
  const groq = new Groq({ apiKey })
  const groqTools = toGroqTools()

  // Keep last 6 turns to stay within Groq free-tier TPM limits
  const trimmed = messages.slice(-6)
  const history: ChatCompletionMessageParam[] = trimmed.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const lastUserMsg = messages.findLast(m => m.role === 'user')?.content?.toLowerCase() ?? ''
  const isQuestion = lastUserMsg.includes('?') || /^(tại sao|như thế nào|bao nhiêu|có thể|bài |là gì|khi nào)/.test(lastUserMsg)
  const WRITE_KEYWORDS = ['tạo ', 'thêm ', 'xóa ', 'giao việc', 'phân công', 'hãy tạo', 'hãy thêm', 'hãy xóa', 'hãy giao', 'hãy phân', 'lên kế hoạch', 'kế hoạch', 'phân tích đề']
  const forceToolFirst = !isQuestion && WRITE_KEYWORDS.some(k => lastUserMsg.includes(k))

  let requireToolNextIter = forceToolFirst

  for (let iteration = 0; iteration < 8; iteration++) {
    const toolChoice = requireToolNextIter ? 'required' : 'auto'
    requireToolNextIter = false

    let response: Awaited<ReturnType<typeof groq.chat.completions.create>>
    try {
      // Use non-streaming to avoid failed_generation during tool call streaming
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
        ],
        tools: groqTools,
        tool_choice: toolChoice,
        stream: false,
      })
    } catch (err: any) {
      if (err?.status === 400 || err?.message?.includes('failed_generation')) {
        // Fallback: stream text only, no tools
        const fallback = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 4096,
          messages: [{ role: 'system', content: systemPrompt }, ...history],
          stream: true,
        })
        for await (const chunk of fallback) {
          const text = chunk.choices[0]?.delta?.content
          if (text) send({ type: 'text_delta', text })
        }
        break
      }
      throw err
    }

    const choice = response.choices[0]
    const msg = choice.message
    const toolCalls = (msg.tool_calls ?? []) as ChatCompletionMessageToolCall[]

    // Stream text (fake-stream since we used non-streaming API)
    if (msg.content) fakeStreamText(msg.content, send)

    // Build history entry
    history.push({
      role: 'assistant',
      content: msg.content ?? null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    } as ChatCompletionMessageParam)

    if (choice.finish_reason === 'stop' || toolCalls.length === 0) break

    const readTools = toolCalls.filter(tc => !WRITE_TOOLS.has(tc.function.name))
    const writeTools = toolCalls.filter(tc => WRITE_TOOLS.has(tc.function.name))

    if (writeTools.length > 0) {
      const writeCalls: ToolCall[] = writeTools.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: normalizeArgs(tc.function.name, safeParseArgs(tc.function.arguments)),
      }))
      send({ type: 'write_tools', tool_calls: writeCalls, preview: buildGhostPreview(writeCalls) })
      break
    }

    // Execute read tools
    const toolResults: ChatCompletionToolMessageParam[] = []
    for (const tc of readTools) {
      send({ type: 'tool_running', tool: tc.function.name })
      const result = await executeToolCall(
        { id: tc.id, name: tc.function.name, input: normalizeArgs(tc.function.name, safeParseArgs(tc.function.arguments)) },
        projectId, userId, supabase,
      )
      const resultStr = JSON.stringify(result.result)
      // Truncate large tool results to avoid TPM overflow
      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: resultStr.length > 3000 ? resultStr.slice(0, 3000) + '…' : resultStr })
    }
    history.push(...toolResults)
    // If user had write intent, force model to call tools after reading
    if (forceToolFirst) requireToolNextIter = true
  }
}
