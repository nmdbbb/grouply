import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, subject, deadline, brief } = await request.json()

  // Dùng service role để bypass RLS
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: project, error: projectError } = await service
    .from('projects')
    .insert({ name, subject: subject || null, deadline, owner_id: user.id, description: brief || null })
    .select()
    .single()

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })

  await Promise.all([
    service.from('sections').insert({ project_id: project.id, name: 'Chung', color: '#EEEDFE', ord: 0 }),
    service.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'owner' }),
  ])

  return NextResponse.json({ projectId: project.id })
}
