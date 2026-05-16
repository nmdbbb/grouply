import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id } = await req.json()
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  // Chỉ owner mới được xóa
  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).single()
  if (membership?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service.from('projects').delete().eq('id', project_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
