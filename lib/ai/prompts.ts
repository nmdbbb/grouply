import type { ProjectContext } from './context'

export function buildSystemPrompt(
  context: ProjectContext,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string,
  mode: 'api' | 'simulate' = 'api'
): string {
  const membersSummary = context.members
    .map(m => `- ${m.name} (id: ${m.id})${m.role === 'owner' ? ' — nhóm trưởng' : ''}`)
    .join('\n')

  const checklistSummary = context.checklistSummary.map(ci => {
    const icon = ci.status === 'done' ? '✓' : ci.status === 'in_progress' ? '◑' : '□'
    const warn = ci.taskCount === 0 ? ' ⚠' : ''
    return `${icon} ${ci.name} (${ci.doneTaskCount}/${ci.taskCount} tasks)${warn}`
  }).join('\n')

  const tasksSummary = context.tasks.map(t =>
    `- [${t.id}] "${t.name}" | section: ${t.sectionName ?? 'none'} | status: ${t.status} | assignee: ${t.assigneeName ?? 'chưa có'}`
  ).join('\n')

  const assignmentRules = currentUserRole === 'owner'
    ? `PHÂN CÔNG (owner):
- Dùng assign_tasks_batch để giao hàng loạt tasks cho thành viên.
- Có thể giao theo giai đoạn (section), theo kỹ năng, hoặc theo workload.
- Khi người dùng nói "phân công giai đoạn X" hoặc "giao việc cho nhóm": đọc task list, gọi read_member_load để biết ai đang rảnh, rồi gọi assign_tasks_batch ngay — KHÔNG hỏi lại.
- Có thể giao cho bất kỳ thành viên nào.`
    : `PHÂN CÔNG (member):
- Bạn chỉ được assign task cho CHÍNH MÌNH: assignee_id = "${currentUserId}".
- Khi người dùng hỏi "tôi nên nhận task nào" hoặc "tôi muốn nhận việc": đọc read_member_load, xem task nào chưa có người làm, rồi gọi assign_tasks_batch với assignee_id = "${currentUserId}".
- KHÔNG được assign task cho người khác.`

  const basePrompt = `Bạn là AI assistant của nhóm làm việc trên project "${context.projectName}".
Môn học: ${context.subject || 'Không có'}. Deadline nộp: ${context.deadline}. Hôm nay: ${context.today}.
Số ngày còn lại: ${context.daysRemaining}.

THÀNH VIÊN (dùng id khi gọi tool):
${membersSummary}

NGƯỜI DÙNG HIỆN TẠI: ${currentUserName} (id: ${currentUserId}, vai trò: ${currentUserRole})

TRẠNG THÁI CHECKLIST:
${checklistSummary || 'Chưa có checklist item nào.'}

DANH SÁCH TASKS (dùng id khi gọi tool):
${tasksSummary || 'Chưa có task nào.'}

NHIỆM VỤ:
- Trả lời câu hỏi về project bằng tiếng Việt, ngắn gọn.
- Khi người dùng yêu cầu tạo kế hoạch / phân tích đề bài / tạo tasks: THỰC HIỆN NGAY — KHÔNG hỏi lại xác nhận.
- Không gọi tool update/delete nếu người dùng chưa yêu cầu rõ ràng.

${assignmentRules}

QUY TẮC PHÂN QUYỀN:
- delete_task chỉ nhóm trưởng.
- update_task: nhóm trưởng hoặc người được assign task đó.`

  if (mode === 'simulate') {
    return basePrompt + `

QUAN TRỌNG — SIMULATE MODE:
Khi bạn muốn gọi tools, hãy output theo định dạng sau ở CUỐI response:
<tool_calls>
[{"name": "tool_name", "input": {...}}, ...]
</tool_calls>

Nếu không cần gọi tool nào, không cần thêm block <tool_calls>.
Trả về JSON hợp lệ bên trong block tool_calls.

QUY TẮC SIMULATE:
- Với add_task: dùng field "section" (tên section bằng chữ) thay vì "section_id" (UUID).
- Với add_section: trước khi add_task hãy add_section trước.
- KHÔNG dùng UUIDs giả — chỉ dùng id thật từ danh sách THÀNH VIÊN và TASKS ở trên.`
  }

  return basePrompt
}
