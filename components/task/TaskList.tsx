'use client'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SectionAccordion } from '@/components/section/SectionAccordion'
import { CreateTaskDialog } from './CreateTaskDialog'
import { CreateSectionDialog } from '@/components/section/CreateSectionDialog'
import type { Section, Task } from '@/types'

interface Props {
  projectId: string
  userId: string
  initialSections: Section[]
  initialTasks: Task[]
}

export function TaskList({ projectId, userId, initialSections, initialTasks }: Props) {
  const [sections, setSections] = useState(initialSections)
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const supabase = createClient()

  const reload = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
      supabase.from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url), section:sections(*)')
        .eq('project_id', projectId)
        .order('created_at'),
    ])
    if (s) setSections(s)
    if (t) setTasks(t as Task[])
  }, [projectId, supabase])

  const visibleTasks = filter === 'mine' ? tasks.filter(t => t.assignee_id === userId) : tasks

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center border rounded-lg overflow-hidden text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 font-medium transition-colors ${filter === 'all' ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-gray-50'}`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setFilter('mine')}
            className={`px-3 py-1.5 font-medium transition-colors ${filter === 'mine' ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-gray-50'}`}
          >
            Của tôi
          </button>
        </div>
        <div className="flex gap-2">
          <CreateSectionDialog
            projectId={projectId}
            currentCount={sections.length}
            onCreated={reload}
          />
          <CreateTaskDialog
            projectId={projectId}
            sections={sections}
            userId={userId}
            onCreated={reload}
          />
        </div>
      </div>

      {sections.map(section => {
        const sectionTasks = visibleTasks.filter(t => t.section_id === section.id)
        if (filter === 'mine' && sectionTasks.length === 0) return null
        return (
          <SectionAccordion
            key={section.id}
            section={section}
            tasks={sectionTasks}
            onUpdated={reload}
          />
        )
      })}

      {visibleTasks.filter(t => !t.section_id).length > 0 && (
        <SectionAccordion
          section={{ id: '', project_id: projectId, name: 'Không có section', color: '#D3D1C7', ord: 999, created_at: '' }}
          tasks={visibleTasks.filter(t => !t.section_id)}
          onUpdated={reload}
        />
      )}

      {filter === 'mine' && visibleTasks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12">Bạn chưa được assign task nào.</p>
      )}
    </div>
  )
}
