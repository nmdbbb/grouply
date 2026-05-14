import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/invite/${token}`)
  }

  const { data: invite } = await supabase
    .from('project_invites')
    .select('*, project:projects(id, name)')
    .eq('token', token)
    .single()

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Link không hợp lệ</h1>
          <p className="text-muted-foreground">Link invite này đã hết hạn hoặc không tồn tại.</p>
          <Button asChild><a href="/dashboard">Về Dashboard</a></Button>
        </div>
      </div>
    )
  }

  const { data: existing } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', invite.project_id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    redirect(`/project/${invite.project_id}`)
  }

  async function acceptInvite() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    await supabase.from('project_members').insert({
      project_id: invite.project_id,
      user_id: user.id,
      role: 'member',
    })

    redirect(`/project/${invite.project_id}`)
  }

  const project = invite.project as { id: string; name: string } | null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border p-8 max-w-sm w-full text-center space-y-4">
        <h1 className="text-xl font-semibold">Bạn được mời tham gia</h1>
        <p className="text-2xl font-bold">{project?.name}</p>
        <form action={acceptInvite}>
          <Button type="submit" className="w-full">Tham gia project</Button>
        </form>
        <Button variant="ghost" asChild className="w-full">
          <a href="/dashboard">Từ chối</a>
        </Button>
      </div>
    </div>
  )
}
