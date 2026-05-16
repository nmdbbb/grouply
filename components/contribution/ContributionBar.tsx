'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface Member {
  id: string
  name: string
  avatar_url: string | null
}

interface Props {
  projectId: string
  members: Member[]
}

interface MemberContrib {
  member: Member
  doneTasks: number
  doingTasks: number
  pct: number
}

export function ContributionBar({ projectId, members }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [contribs, setContribs] = useState<MemberContrib[]>([])
  const supabase = createClient()

  async function loadContributions() {
    const [{ data: doneTasks }, { data: doingTasks }] = await Promise.all([
      supabase
        .from('tasks')
        .select('assignee_id')
        .eq('project_id', projectId)
        .eq('status', 'done')
        .not('assignee_id', 'is', null),
      supabase
        .from('tasks')
        .select('assignee_id')
        .eq('project_id', projectId)
        .in('status', ['doing', 'review'])
        .not('assignee_id', 'is', null),
    ])

    const totalDone = doneTasks?.length ?? 0
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name))

    const result: MemberContrib[] = sorted.map(m => {
      const done = (doneTasks ?? []).filter(t => t.assignee_id === m.id).length
      const doing = (doingTasks ?? []).filter(t => t.assignee_id === m.id).length
      return {
        member: m,
        doneTasks: done,
        doingTasks: doing,
        pct: totalDone > 0 ? Math.round((done / totalDone) * 100) : 0,
      }
    })

    setContribs(result)
  }

  useEffect(() => {
    loadContributions()
    const channel = supabase
      .channel(`contribution-${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `project_id=eq.${projectId}`,
      }, () => loadContributions())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, members]) // eslint-disable-line react-hooks/exhaustive-deps

  if (collapsed) {
    return (
      <div className="border-t bg-white px-4 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground font-medium">Contribution</span>
        <button onClick={() => setCollapsed(false)} className="text-xs text-muted-foreground hover:text-foreground">▲</button>
      </div>
    )
  }

  return (
    <div className="border-t bg-white px-4 py-3 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Contribution</span>
        <button onClick={() => setCollapsed(true)} className="text-xs text-muted-foreground hover:text-foreground">▼</button>
      </div>
      <div className="flex items-center gap-4 overflow-x-auto pb-1">
        {contribs.map(c => (
          <div key={c.member.id} className="flex items-center gap-2 shrink-0 group relative">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={c.member.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">{getInitials(c.member.name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">{c.member.name}</span>
              <div className="flex items-center gap-1">
                <div
                  className="h-2 bg-teal-500 rounded-sm"
                  style={{ width: `${Math.max(c.pct, 2)}px`, maxWidth: '80px' }}
                />
                <span className="text-[10px] text-muted-foreground">{c.pct}%</span>
              </div>
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-0 mb-1 bg-gray-800 text-white text-[10px] rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
              {c.doneTasks} done · {c.doingTasks} doing
            </div>
          </div>
        ))}
        {contribs.length === 0 && (
          <span className="text-xs text-muted-foreground">Chưa có task hoàn thành.</span>
        )}
      </div>
    </div>
  )
}
