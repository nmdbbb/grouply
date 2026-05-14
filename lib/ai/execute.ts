import { createClient } from '@/lib/supabase/server'
import { buildProjectContext } from './context'
import type { ToolCall } from '@/stores/chatStore'

const SECTION_COLORS = ['#EEEDFE','#FEF3C7','#D1FAE5','#FEE2E2','#DBEAFE','#F3E8FF','#ECFDF5','#FFF7ED']

export interface ToolResult {
  toolName: string
  result: unknown
  error?: string
}

export async function executeToolCall(
  tool: ToolCall,
  projectId: string,
  userId: string
): Promise<ToolResult> {
  const supabase = await createClient()
  const { name, input } = tool

  try {
    switch (name) {
      case 'read_project': {
        const context = await buildProjectContext(projectId)
        return { toolName: name, result: context }
      }
      case 'read_task': {
        const { data } = await supabase
          .from('tasks')
          .select('*, assignee:profiles(*), claims:task_claims(*, profile:profiles(*)), documents:task_documents(*)')
          .eq('id', input.task_id as string)
          .single()
        return { toolName: name, result: data }
      }
      case 'read_member_load': {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('assignee_id, status, name, id')
          .eq('project_id', projectId)
          .in('status', ['todo', 'doing', 'review'])
        const { data: members } = await supabase
          .from('project_members')
          .select('*, profile:profiles(id, name)')
          .eq('project_id', projectId)
        const load = (members ?? []).map(m => {
          const memberId = (m.profile as any)?.id
          const memberTasks = (tasks ?? []).filter(t => t.assignee_id === memberId)
          return {
            memberId,
            memberName: (m.profile as any)?.name,
            tasks_doing: memberTasks.filter(t => t.status === 'doing' || t.status === 'review'),
            tasks_todo: memberTasks.filter(t => t.status === 'todo'),
            total_load_count: memberTasks.length,
          }
        })
        return { toolName: name, result: load }
      }
      case 'add_task': {
        const { data } = await supabase.from('tasks').insert({
          project_id: projectId,
          section_id: (input.section_id as string) || null,
          name: input.name as string,
          type: (input.type as string) || 'output',
          checklist_item_id: (input.checklist_item_id as string) || null,
          blocked_by_id: (input.blocked_by_id as string) || null,
          deadline: (input.deadline as string) || null,
          assignee_id: (input.assignee_id as string) || null,
          pos_x: (input.pos_x as number) || 50,
          pos_y: (input.pos_y as number) || 50,
          created_by: userId,
        }).select().single()
        return { toolName: name, result: data }
      }
      case 'update_task': {
        const fields = input.fields as Record<string, unknown>
        const { data } = await supabase
          .from('tasks').update(fields).eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'delete_task': {
        await supabase.from('tasks').delete().eq('id', input.task_id as string)
        return { toolName: name, result: { success: true } }
      }
      case 'add_section': {
        const { data: existing } = await supabase.from('sections').select('id').eq('project_id', projectId)
        const color = (input.color as string) || SECTION_COLORS[(existing?.length ?? 0) % SECTION_COLORS.length]
        const { data } = await supabase.from('sections').insert({
          project_id: projectId,
          name: input.name as string,
          color,
          ord: existing?.length ?? 0,
        }).select().single()
        return { toolName: name, result: data }
      }
      case 'add_checklist_item': {
        const { data: existing } = await supabase.from('checklist_items').select('id').eq('project_id', projectId)
        const { data } = await supabase.from('checklist_items').insert({
          project_id: projectId,
          name: input.name as string,
          description: (input.description as string) || null,
          ord: existing?.length ?? 0,
        }).select().single()
        return { toolName: name, result: data }
      }
      case 'link_task_to_item': {
        const { data } = await supabase
          .from('tasks').update({ checklist_item_id: input.checklist_item_id as string })
          .eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'set_dependency': {
        const { data } = await supabase
          .from('tasks').update({ blocked_by_id: input.blocked_by_id as string })
          .eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'remove_dependency': {
        const { data } = await supabase
          .from('tasks').update({ blocked_by_id: null })
          .eq('id', input.task_id as string).select().single()
        return { toolName: name, result: data }
      }
      case 'suggest_assignment':
        return { toolName: name, result: { note: 'Use read_member_load to get context, then suggest.' } }
      default:
        return { toolName: name, result: null, error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    return { toolName: name, result: null, error: err.message }
  }
}

export async function executeToolCalls(
  toolCalls: ToolCall[],
  projectId: string,
  userId: string
): Promise<ToolResult[]> {
  return Promise.all(toolCalls.map(tc => executeToolCall(tc, projectId, userId)))
}

export function buildGhostPreview(toolCalls: ToolCall[]): { description: string; changes: string[] } {
  const changes = toolCalls.map(tc => {
    switch (tc.name) {
      case 'add_task': return `Thêm task: "${tc.input.name}"`
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
      default: return tc.name
    }
  })
  return { description: `${toolCalls.length} thay đổi sẽ được thực hiện`, changes }
}
