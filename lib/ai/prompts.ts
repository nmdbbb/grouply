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
