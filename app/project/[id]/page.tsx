import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WorkspaceClient } from '@/components/WorkspaceClient'
import { buildProjectContext } from '@/lib/ai/context'
import type { Task, Section } from '@/types'

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase.from('projects').select('*').eq('id', id).single()
  if (!project) redirect('/dashboard')

  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', id).eq('user_id', user.id).single()
  if (!membership) redirect('/dashboard')

  const [{ data: sections }, { data: tasks }, { data: members }, { data: profile }] = await Promise.all([
    supabase.from('sections').select('*').eq('project_id', id).order('ord'),
    supabase.from('tasks').select('*, assignee:profiles(*)').eq('project_id', id).order('created_at'),
    supabase.from('project_members').select('*, profile:profiles(id, name, avatar_url)').eq('project_id', id),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
  ])

  const memberProfiles = (members ?? []).map(m => ({
    id: (m.profile as any)?.id ?? '',
    name: (m.profile as any)?.name ?? '',
    avatar_url: (m.profile as any)?.avatar_url ?? null,
    role: m.role,
  }))

  const aiContext = await buildProjectContext(id)

  return (
    <WorkspaceClient
      project={project}
      userId={user.id}
      userRole={membership.role as 'owner' | 'member'}
      initialSections={(sections ?? []) as Section[]}
      initialTasks={(tasks ?? []) as Task[]}
      members={memberProfiles}
      aiContext={aiContext}
      currentUserName={(profile as any)?.name ?? 'Unknown'}
    />
  )
}
