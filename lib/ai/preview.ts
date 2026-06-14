import type { ToolCall, GhostPreview } from '@/stores/chatStore'

export function buildGhostPreview(toolCalls: ToolCall[]): GhostPreview {
  const changes = toolCalls.map(tc => {
    switch (tc.name) {
      case 'add_task': return `Thêm task: "${(tc.input.name ?? tc.input.title) || '(Không tên)'}"`
      case 'update_task': {
        const fields = tc.input.fields as Record<string, unknown>
        return `Cập nhật task (${Object.keys(fields).join(', ')})`
      }
      case 'delete_task': return `Xóa task`
      case 'add_section': return `Thêm section: "${tc.input.name}"`
      case 'add_checklist_item': return `Thêm checklist: "${tc.input.name}"`
      case 'link_task_to_item': return `Liên kết task với checklist item`
      case 'set_dependency': return `Tạo dependency`
      case 'remove_dependency': return `Xóa dependency`
      case 'assign_tasks_batch': {
        const assignments = tc.input.assignments as { task_id: string; assignee_id: string }[]
        return `Phân công ${assignments?.length ?? 0} tasks`
      }
      default: return tc.name
    }
  })
  return { description: `${toolCalls.length} thay đổi sẽ được thực hiện`, changes }
}
