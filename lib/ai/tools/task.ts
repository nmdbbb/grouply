import { resolveSectionId } from './sectionResolver'
import { TASK_POSITION_TOP, TASK_POSITION_GAP } from '../constants'
import type { ToolResult } from './types'

export async function handleAddTask(
  input: Record<string, unknown>,
  projectId: string,
  userId: string,
  supabase: any
): Promise<ToolResult> {
  const sectionId = await resolveSectionId(
    input.section_id as string | null,
    input.section as string | undefined,
    projectId,
    supabase
  )

  let posX = (input.pos_x as number) || 20
  let posY = (input.pos_y as number) || TASK_POSITION_TOP
  if (!input.pos_x && !input.pos_y && sectionId) {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', sectionId)
    posY = TASK_POSITION_TOP + (count ?? 0) * TASK_POSITION_GAP
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

  return { toolName: 'add_task', result: data }
}

export async function handleUpdateTask(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const fields = input.fields as Record<string, unknown>
  const { data } = await supabase
    .from('tasks')
    .update(fields)
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'update_task', result: data }
}

export async function handleDeleteTask(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  await supabase.from('tasks').delete().eq('id', input.task_id as string)
  return { toolName: 'delete_task', result: { success: true } }
}

export async function handleAssignTasksBatch(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const assignments = input.assignments as { task_id: string; assignee_id: string }[]
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { toolName: 'assign_tasks_batch', result: null, error: 'assignments must be a non-empty array' }
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
  if (errors.length > 0) return { toolName: 'assign_tasks_batch', result: null, error: errors.join('; ') }
  return { toolName: 'assign_tasks_batch', result: results.map((r: any) => r.data) }
}
