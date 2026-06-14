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

const SIMULATE_INSTRUCTION = `SIMULATE MODE: output tool calls as JSON at end of response inside <tool_calls>[...]</tool_calls>. Mỗi phần tử dạng {"name": "<tool>", "input": {...}}. Dùng tên section (không phải UUID) cho add_task. Không bịa UUID.`

export function buildSimulatePrompt(
  context: ProjectContext,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string
): string {
  // buildSystemPrompt no longer takes a mode arg (clean refactor), so we append the
  // simulate instruction here instead of threading a flag through prompts.ts.
  const systemPrompt = `${buildSystemPrompt(context, currentUserName, currentUserRole, currentUserId)}\n\n${SIMULATE_INSTRUCTION}`

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
