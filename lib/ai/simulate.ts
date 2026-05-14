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
}

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
