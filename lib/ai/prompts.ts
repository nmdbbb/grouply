import type { ProjectContext } from './context'

export function buildSystemPrompt(
  context: ProjectContext,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string,
  provider?: 'groq',
): string {
  // [1] IDENTITY
  const identity = `Bạn là AI assistant của nhóm, project: "${context.projectName}".
Môn: ${context.subject || 'Không có'}. Deadline: ${context.deadline}. Hôm nay: ${context.today}. Còn ${context.daysRemaining} ngày.`

  // [2] MEMBERS
  const memberLines = context.members.length === 0
    ? '(Chưa có thành viên)'
    : context.members.map(m => `- ${m.name} (id: ${m.id})${m.role === 'owner' ? ' [nhóm trưởng]' : ''}`).join('\n')
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
- Chỉ trả lời ngay nếu câu hỏi chỉ về deadline, tên project, danh sách thành viên.

Khi nào gọi search_documents:
- Hỏi về nội dung đề bài, yêu cầu, rubric, tiêu chí chấm điểm → doc_type="project_doc"
- Hỏi về lịch sử: "AI đã làm gì?", "tại sao task X assign cho Y?", "trước đây nhóm đã điều chỉnh gì?" → doc_type="activity_log"
- Query chứa tên người, con số, thuật ngữ cụ thể → thêm use_hybrid=true

Khi đề xuất thay đổi (replan, điều chỉnh task, phân công lại):
1. Gọi read_project để nắm trạng thái hiện tại
2. Gọi search_documents với doc_type="activity_log" để xem lịch sử
3. Đề xuất dựa trên cả hai nguồn
4. Nếu có precedent từ activity_log, cite: "Trước đây nhóm đã..."`

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

  if (provider === 'groq') {
    return base + `\n\nIMPORTANT: Respond by calling tools only. Never write a bullet-list plan or describe steps. When asked to plan/create tasks: call add_section then add_task immediately. Tool arguments must be valid JSON. Use real UUIDs from the MEMBERS list above.`
  }

  return base
}
