'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function InviteButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function generateInvite() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_invites')
      .insert({ project_id: projectId })
      .select()
      .single()

    if (error || !data) {
      toast.error('Lỗi', { description: error?.message })
    } else {
      const link = `${window.location.origin}/invite/${data.token}`
      await navigator.clipboard.writeText(link)
      toast.success('Đã copy link invite', { description: link })
    }
    setLoading(false)
  }

  return (
    <Button variant="outline" size="sm" onClick={generateInvite} disabled={loading}>
      {loading ? '...' : '+ Mời thành viên'}
    </Button>
  )
}
