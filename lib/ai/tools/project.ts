import { buildProjectContext } from '../context'
import type { ToolResult } from './types'

export async function handleReadProject(projectId: string): Promise<ToolResult> {
  const context = await buildProjectContext(projectId)
  return { toolName: 'read_project', result: context }
}

export async function handleReadTask(input: Record<string, unknown>, projectId: string, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url), claims:task_claims(*, profile:profiles(id, name, avatar_url)), documents:task_documents(*)')
    .eq('id', input.task_id as string)
    .eq('project_id', projectId)
    .single()
  return { toolName: 'read_task', result: data }
}

export async function handleReadMemberLoad(projectId: string, supabase: any): Promise<ToolResult> {
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
  return { toolName: 'read_member_load', result: load }
}

export async function handleReadTasksBySection(input: Record<string, unknown>, projectId: string, supabase: any): Promise<ToolResult> {
  let query = supabase
    .from('tasks')
    .select('id, name, status, type, assignee_id, section_id, deadline, is_optional, assignee:profiles!tasks_assignee_id_fkey(id, name), section:sections(id, name)')
    .eq('project_id', projectId)
  if (input.section_id) query = query.eq('section_id', input.section_id as string)
  if (input.status) query = query.eq('status', input.status as string)
  const { data } = await query.order('created_at')
  return { toolName: 'read_tasks_by_section', result: data ?? [] }
}
