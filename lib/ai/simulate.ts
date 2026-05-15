import { buildSystemPrompt } from './prompts'
import { TOOL_DEFINITIONS } from './tools'
import type { ProjectContext } from './context'
import type { ToolCall } from '@/stores/chatStore'

export function buildSimulatePrompt(
  context: ProjectContext,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string
): string {
  const systemPrompt = buildSystemPrompt(context, currentUserName, currentUserRole, currentUserId, 'simulate')

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
  // Format 1: <tool_calls>[...]</tool_calls>
  const xmlMatch = responseText.match(/<tool_calls>\s*([\s\S]*?)\s*<\/tool_calls>/)
  if (xmlMatch) {
    try {
      const parsed = JSON.parse(xmlMatch[1])
      if (Array.isArray(parsed)) {
        return parsed.filter(tc => typeof tc.name === 'string' && tc.input !== undefined)
      }
    } catch {}
  }

  // Format 2: plain JSON array anywhere in text (greedy - lấy array lớn nhất)
  const arrayMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) {
        return parsed.filter(tc => typeof tc.name === 'string' && tc.input !== undefined)
      }
    } catch {}
  }

  // Format 3: ```json [...] ```
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
