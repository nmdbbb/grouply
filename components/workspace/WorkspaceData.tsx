'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Task, Section } from '@/types'

interface DataProps {
  projectId: string
  initialSections: Section[]
  initialTasks: Task[]
  children: (data: {
    liveSections: Section[]
    liveTasks: Task[]
    pendingBrief: string | null
    reloadData: () => Promise<void>
  }) => React.ReactNode
}

export function WorkspaceData({ projectId, initialSections, initialTasks, children }: DataProps) {
  const [liveSections, setLiveSections] = useState(initialSections)
  const [liveTasks, setLiveTasks] = useState(initialTasks)
  const [pendingBrief, setPendingBrief] = useState<string | null>(null)
  const supabase = createClient()
  const searchParams = useSearchParams()

  const reloadData = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
      supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url)').eq('project_id', projectId).order('created_at'),
    ])
    if (s) setLiveSections(s as Section[])
    if (t) setLiveTasks(t as Task[])
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get('parseBrief') !== '1') return
    const brief = localStorage.getItem(`grouply-brief-${projectId}`)
    if (!brief) return
    localStorage.removeItem(`grouply-brief-${projectId}`)
    setPendingBrief(brief)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children({ liveSections, liveTasks, pendingBrief, reloadData })}</>
}
