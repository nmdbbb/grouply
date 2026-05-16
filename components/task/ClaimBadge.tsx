'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface Claimer {
  userId: string
  name: string
  avatar_url: string | null
}

interface Props {
  taskId: string
  currentUserId: string
  assigneeId: string | null
}

export function ClaimBadge({ taskId, currentUserId, assigneeId }: Props) {
  const [claimers, setClaimers] = useState<Claimer[]>([])
  const [hasClaimed, setHasClaimed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadClaims()
    const channel = supabase
      .channel(`claims-${taskId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'task_claims',
        filter: `task_id=eq.${taskId}`,
      }, () => loadClaims())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadClaims() {
    const { data } = await supabase
      .from('task_claims')
      .select('user_id, profile:profiles(id, name, avatar_url)')
      .eq('task_id', taskId)
    const list: Claimer[] = (data ?? []).map(c => ({
      userId: c.user_id,
      name: (c.profile as any)?.name ?? '',
      avatar_url: (c.profile as any)?.avatar_url ?? null,
    }))
    setClaimers(list)
    setHasClaimed(list.some(c => c.userId === currentUserId))
  }

  async function handleClaim(e: React.MouseEvent) {
    e.stopPropagation()
    if (hasClaimed) {
      await supabase.from('task_claims').delete().eq('task_id', taskId).eq('user_id', currentUserId)
    } else {
      await supabase.from('task_claims').insert({ task_id: taskId, user_id: currentUserId })
    }
    loadClaims()
  }

  if (assigneeId) return null

  const visible = claimers.slice(0, 3)
  const overflow = claimers.length - 3

  return (
    <div
      className="flex items-center gap-1 cursor-pointer"
      onClick={handleClaim}
      title={hasClaimed ? 'Rút claim' : 'Claim task này'}
    >
      {visible.map(c => (
        <Avatar key={c.userId} className="h-4 w-4 border border-white">
          <AvatarImage src={c.avatar_url ?? undefined} />
          <AvatarFallback className="text-[8px]">{getInitials(c.name)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">+{overflow}</span>
      )}
      {claimers.length === 0 && (
        <span className="text-[10px] text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity">
          + Claim
        </span>
      )}
    </div>
  )
}
