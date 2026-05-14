import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ProjectCard } from '@/components/dashboard/ProjectCard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('project_members')
    .select(`
      project_id,
      projects (
        id, name, subject, deadline, owner_id, created_at,
        project_members (
          id, user_id, role, joined_at,
          profile:profiles (id, name, avatar_url)
        ),
        checklist_items (id, name, ord)
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const projectIds = (memberships ?? []).map(m => m.project_id)
  const { data: doneTasks } = projectIds.length > 0
    ? await supabase
        .from('tasks')
        .select('project_id, checklist_item_id')
        .in('project_id', projectIds)
        .eq('status', 'done')
        .not('checklist_item_id', 'is', null)
    : { data: [] }

  const doneByProject = (doneTasks ?? []).reduce<Record<string, Set<string>>>((acc, t) => {
    if (!acc[t.project_id]) acc[t.project_id] = new Set()
    if (t.checklist_item_id) acc[t.project_id].add(t.checklist_item_id)
    return acc
  }, {})

  async function handleSignOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">Grouply</span>
        <form action={handleSignOut}>
          <Button variant="ghost" size="sm" type="submit">Đăng xuất</Button>
        </form>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Projects của bạn</h1>
          <Button render={<Link href="/project/new" />}>
            + Tạo project mới
          </Button>
        </div>
        {(!memberships || memberships.length === 0) ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Chưa có project nào.</p>
            <Button render={<Link href="/project/new" />} className="mt-4">
              Tạo project đầu tiên
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberships.map(m => {
              const project = m.projects as any
              if (!project) return null
              const members = project.project_members ?? []
              const checklistItems = project.checklist_items ?? []
              const doneItemIds = doneByProject[project.id] ?? new Set()
              const doneCount = checklistItems.filter((ci: any) => doneItemIds.has(ci.id)).length
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  members={members}
                  checklistItems={checklistItems}
                  doneCount={doneCount}
                />
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
