import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MemberDashboard } from '@/components/contribution/MemberDashboard'
import type { Task, Section } from '@/types'

export const dynamic = 'force-dynamic'

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase.from('projects').select('*').eq('id', id).single()
  if (!project) redirect('/dashboard')

  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', id).eq('user_id', user.id).single()
  if (!membership) redirect('/dashboard')

  const [{ data: members }, { data: tasks }, { data: sections }] = await Promise.all([
    supabase.from('project_members').select('*, profile:profiles(id, name, avatar_url)').eq('project_id', id),
    supabase.from('tasks').select('*, section:sections(id,name)').eq('project_id', id).order('created_at'),
    supabase.from('sections').select('*').eq('project_id', id).order('ord'),
  ])

  const memberProfiles = (members ?? []).map(m => ({
    id: (m.profile as any)?.id ?? '',
    name: (m.profile as any)?.name ?? 'Unknown',
    avatar_url: (m.profile as any)?.avatar_url ?? null,
    role: m.role,
  }))

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center gap-3 shrink-0 shadow-[0_1px_0_0_#E5E7EB]">
        <Link
          href={`/project/${id}`}
          className="text-sm text-muted-foreground hover:text-gray-700 flex items-center gap-1.5 transition-colors"
        >
          ← {project.name}
        </Link>
        <span className="text-border text-sm">/</span>
        <span className="text-sm font-semibold text-gray-800">Thành viên</span>
      </header>

      {/* Dashboard */}
      <MemberDashboard
        members={memberProfiles}
        tasks={(tasks ?? []) as Task[]}
        sections={(sections ?? []) as Section[]}
        currentUserId={user.id}
      />
    </div>
  )
}
