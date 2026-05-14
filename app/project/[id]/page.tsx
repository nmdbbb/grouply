import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteButton } from '@/components/project/InviteButton'
import { TaskList } from '@/components/task/TaskList'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section } from '@/types'

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) redirect('/dashboard')

  const { data: membership } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', id)
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/dashboard')

  const [{ data: sections }, { data: tasks }] = await Promise.all([
    supabase.from('sections').select('*').eq('project_id', id).order('ord'),
    supabase.from('tasks')
      .select('*, assignee:profiles(*), section:sections(*)')
      .eq('project_id', id)
      .order('created_at'),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold">Grouply</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{project.name}</span>
          {project.subject && <span className="text-sm text-muted-foreground">{project.subject}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Deadline: {formatDeadline(project.deadline)}</span>
          {membership.role === 'owner' && <InviteButton projectId={project.id} />}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <TaskList
          projectId={project.id}
          userId={user.id}
          initialSections={(sections ?? []) as Section[]}
          initialTasks={(tasks ?? []) as Task[]}
        />
      </main>
    </div>
  )
}
