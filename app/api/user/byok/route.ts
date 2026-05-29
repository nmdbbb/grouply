import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PROVIDERS } from '@/lib/ai/providers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('byok_keys')
    .eq('id', user.id)
    .single()

  const keys = (profile?.byok_keys ?? {}) as Record<string, string>
  const presence: Record<string, boolean> = {}
  for (const id of Object.keys(PROVIDERS)) {
    presence[id] = Boolean(keys[id])
  }

  return Response.json({ keys: presence })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { provider, key } = body as { provider: string; key: string }

  if (!provider || !(provider in PROVIDERS) || !key?.trim()) {
    return new Response('Bad Request', { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('byok_keys')
    .eq('id', user.id)
    .single()

  const existing = (profile?.byok_keys ?? {}) as Record<string, string>
  const encoded = Buffer.from(key.trim()).toString('base64')
  const updated = { ...existing, [provider]: encoded }

  const { error } = await supabase
    .from('profiles')
    .update({ byok_keys: updated })
    .eq('id', user.id)

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
