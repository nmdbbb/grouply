import { createClient } from '@/lib/supabase/server'
import { differenceInDays, format } from 'date-fns'

export interface ProjectContext {
  projectId: string
  projectName: string
  subject: string
  deadline: string
  daysRemaining: number
  today: string
  members: MemberContext[]
  checklistSummary: ChecklistSummaryItem[]
  tasks: TaskContext[]
  sections: SectionContext[]
}

export interface MemberContext {
  id: string
  name: string
  role: string
}

export interface ChecklistSummaryItem {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'done'
  taskCount: number
  doneTaskCount: number
}

export interface TaskContext {
  id: string
  name: string
  status: string
  type: string
  assigneeId: string | null
  assigneeName: string | null
  sectionId: string | null
  sectionName: string | null
  checklistItemId: string | null
  blockedById: string | null
  deadline: string | null
  isOptional: boolean
}

export interface SectionContext {
  id: string
  name: string
}

export async function buildProjectContext(projectId: string): Promise<ProjectContext> {
  const supabase = await createClient()

  const [
    { data: project },
    { data: members },
    { data: tasks },
    { data: sections },
    { data: checklistItems },
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('project_members').select('*, profile:profiles(id, name)').eq('project_id', projectId),
    supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, name)').eq('project_id', projectId),
    supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
    supabase.from('checklist_items').select('*').eq('project_id', projectId).order('ord'),
  ])

  const today = new Date()
  const deadline = project?.deadline ? new Date(project.deadline) : today
  const daysRemaining = differenceInDays(deadline, today)

  const memberList: MemberContext[] = (members ?? []).map(m => ({
    id: (m.profile as any)?.id ?? m.user_id,
    name: (m.profile as any)?.name ?? 'Unknown',
    role: m.role,
  }))

  const taskList: TaskContext[] = (tasks ?? []).map(t => {
    const section = (sections ?? []).find(s => s.id === t.section_id)
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      type: t.type,
      assigneeId: t.assignee_id,
      assigneeName: (t.assignee as any)?.name ?? null,
      sectionId: t.section_id,
      sectionName: section?.name ?? null,
      checklistItemId: t.checklist_item_id,
      blockedById: t.blocked_by_id,
      deadline: t.deadline,
      isOptional: t.is_optional,
    }
  })

  const checklistSummary: ChecklistSummaryItem[] = (checklistItems ?? []).map(ci => {
    const ciTasks = taskList.filter(t => t.checklistItemId === ci.id)
    const doneTasks = ciTasks.filter(t => t.status === 'done')
    let status: 'pending' | 'in_progress' | 'done' = 'pending'
    if (ciTasks.length > 0 && doneTasks.length === ciTasks.length) status = 'done'
    else if (ciTasks.some(t => t.status === 'doing' || t.status === 'review')) status = 'in_progress'
    return {
      id: ci.id,
      name: ci.name,
      status,
      taskCount: ciTasks.length,
      doneTaskCount: doneTasks.length,
    }
  })

  return {
    projectId,
    projectName: project?.name ?? '',
    subject: project?.subject ?? '',
    deadline: project?.deadline ?? '',
    daysRemaining,
    today: format(today, 'yyyy-MM-dd'),
    members: memberList,
    checklistSummary,
    tasks: taskList,
    sections: (sections ?? []).map(s => ({ id: s.id, name: s.name })),
  }
}
