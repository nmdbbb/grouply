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

function toGroqTools(): ChatCompletionTool[] {
  return TOOL_DEFINITIONS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }))
}

// Assembled tool call built up from streaming deltas
interface AssembledToolCall {
  id: string
  name: string
  argumentsRaw: string
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

  const history: ChatCompletionMessageParam[] = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  for (let iteration = 0; iteration < 8; iteration++) {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
      ],
      tools: groqTools,
      tool_choice: 'auto',
      stream: true,
    })

    // Assemble full response while streaming text deltas
    let fullText = ''
    let finishReason: string | null = null
    // Map from index → assembled tool call
    const toolCallMap: Record<number, AssembledToolCall> = {}

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue

      const delta = choice.delta

      // Stream text immediately
      if (delta.content) {
        fullText += delta.content
        send({ type: 'text_delta', text: delta.content })
      }

      // Assemble tool call deltas by index
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!toolCallMap[idx]) {
            toolCallMap[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', argumentsRaw: '' }
          }
          if (tc.id) toolCallMap[idx].id = tc.id
          if (tc.function?.name) toolCallMap[idx].name = tc.function.name
          if (tc.function?.arguments) toolCallMap[idx].argumentsRaw += tc.function.arguments
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason
    }

    const assembledToolCalls = Object.values(toolCallMap)

    // Build the assistant message for history
    const assistantToolCalls: ChatCompletionMessageToolCall[] = assembledToolCalls.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.argumentsRaw },
    }))

    history.push({
      role: 'assistant',
      content: fullText || null,
      tool_calls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
    } as ChatCompletionMessageParam)

    if (finishReason === 'stop' || assembledToolCalls.length === 0) break

    const readTools = assembledToolCalls.filter(tc => !WRITE_TOOLS.has(tc.name))
    const writeTools = assembledToolCalls.filter(tc => WRITE_TOOLS.has(tc.name))

    if (writeTools.length > 0) {
      const writeCalls: ToolCall[] = writeTools.map(tc => ({
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.argumentsRaw || '{}'),
      }))
      const preview = buildGhostPreview(writeCalls)
      send({ type: 'write_tools', tool_calls: writeCalls, preview })
      break
    }

    // Execute read tools and feed results back
    const toolResults: ChatCompletionToolMessageParam[] = []
    for (const tc of readTools) {
      send({ type: 'tool_running', tool: tc.name })
      const result = await executeToolCall(
        { id: tc.id, name: tc.name, input: JSON.parse(tc.argumentsRaw || '{}') },
        projectId,
        userId,
        supabase,
      )
      toolResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result.result),
      })
    }

    history.push(...toolResults)
  }
}
