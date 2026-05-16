import { buildProjectContext } from './context'
import { buildGhostPreview } from './preview'
import type { ToolCall } from '@/stores/chatStore'

export { buildGhostPreview }

const SECTION_COLORS = ['#EEEDFE','#FEF3C7','#D1FAE5','#FEE2E2','#DBEAFE','#F3E8FF','#ECFDF5','#FFF7ED']

export interface ToolResult {
  toolName: string
  result: unknown
  error?: string
}

// executeToolCall runs server-side only (called from /api/ai/chat route)
// It receives a supabase client passed in to avoid importing server modules here
export async function executeToolCall(
  tool: ToolCall,
  projectId: string,
  userId: string,
  supabase: any
): Promise<ToolResult> {
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
          .select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url), claims:task_claims(*, profile:profiles(id, name, avatar_url)), documents:task_documents(*)')
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
        const load = (members ?? []).map((m: any) => {
          const memberId = m.profile?.id
          const memberTasks = (tasks ?? []).filter((t: any) => t.assignee_id === memberId)
          return {
            memberId,
            memberName: m.profile?.name,
            tasks_doing: memberTasks.filter((t: any) => t.status === 'doing' || t.status === 'review'),
            tasks_todo: memberTasks.filter((t: any) => t.status === 'todo'),
            total_load_count: memberTasks.length,
          }
        })
        return { toolName: name, result: load }
      }
      case 'read_tasks_by_section': {
        let query = supabase
          .from('tasks')
          .select('id, name, status, type, assignee_id, section_id, deadline, is_optional, assignee:profiles!tasks_assignee_id_fkey(id, name), section:sections(id, name)')
          .eq('project_id', projectId)
        if (input.section_id) query = query.eq('section_id', input.section_id as string)
        if (input.status) query = query.eq('status', input.status as string)
        const { data } = await query.order('created_at')
        return { toolName: name, result: data ?? [] }
      }
      case 'add_task': {
        // Resolve section name → id nếu AI truyền tên thay vì id
        let sectionId = (input.section_id as string) || null
        const sectionName = input.section as string
        if (!sectionId && sectionName) {
          const { data: sec } = await supabase
            .from('sections').select('id').eq('project_id', projectId).ilike('name', `%${sectionName}%`).limit(1).single()
          sectionId = sec?.id ?? null
        }
        // Auto-position: stack tasks vertically within section (20px top + 80px per existing task)
        let posX = (input.pos_x as number) || 20
        let posY = (input.pos_y as number) || 20
        if (!input.pos_x && !input.pos_y && sectionId) {
          const { count } = await supabase
            .from('tasks').select('id', { count: 'exact', head: true }).eq('section_id', sectionId)
          posY = 20 + (count ?? 0) * 80
        }
        const { data } = await supabase.from('tasks').insert({
          project_id: projectId,
          section_id: sectionId,
          name: (input.name ?? input.title) as string,
          description: (input.description as string) || null,
          type: (input.type as string) || 'output',
          checklist_item_id: (input.checklist_item_id as string) || null,
          blocked_by_id: (input.blocked_by_id as string) || null,
          deadline: (input.deadline as string) || (input.due as string) || null,
          assignee_id: (input.assignee_id as string) || null,
          pos_x: posX,
          pos_y: posY,
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
      case 'assign_tasks_batch': {
        const assignments = input.assignments as { task_id: string; assignee_id: string }[]
        if (!Array.isArray(assignments) || assignments.length === 0) {
          return { toolName: name, result: null, error: 'assignments must be a non-empty array' }
        }
        const results = await Promise.all(
          assignments.map(({ task_id, assignee_id }) =>
            supabase.from('tasks')
              .update({ assignee_id })
              .eq('id', task_id)
              .eq('project_id', projectId)
              .select('id, name, assignee_id')
              .single()
          )
        )
        const errors = results.filter((r: any) => r.error).map((r: any) => r.error?.message)
        if (errors.length > 0) return { toolName: name, result: null, error: errors.join('; ') }
        return { toolName: name, result: results.map((r: any) => r.data) }
      }
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
  userId: string,
  supabase: any
): Promise<ToolResult[]> {
  // Execute tuần tự để section tạo trước, task có thể resolve section_id
  const sectionNameToId: Record<string, string> = {}
  const results: ToolResult[] = []

  for (let tc of toolCalls) {
    // Inject section_id từ cache nếu add_task dùng section name
    if (tc.name === 'add_task' && !tc.input.section_id && tc.input.section) {
      const sectionName = tc.input.section as string
      if (sectionNameToId[sectionName]) {
        tc = { ...tc, input: { ...tc.input, section_id: sectionNameToId[sectionName] } }
      }
    }

    const result = await executeToolCall(tc, projectId, userId, supabase)

    // Cache section id sau khi tạo
    if (tc.name === 'add_section' && result.result) {
      const sec = result.result as any
      if (sec?.id && tc.input.name) {
        sectionNameToId[tc.input.name as string] = sec.id
      }
    }

    results.push(result)
  }

  return results
}
