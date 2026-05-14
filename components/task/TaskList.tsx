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
  const supabase = createClient()

  const reload = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
      supabase.from('tasks')
        .select('*, assignee:profiles(*), section:sections(*)')
        .eq('project_id', projectId)
        .order('created_at'),
    ])
    if (s) setSections(s)
    if (t) setTasks(t as Task[])
  }, [projectId, supabase])

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
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
      {sections.map(section => (
        <SectionAccordion
          key={section.id}
          section={section}
          tasks={tasks.filter(t => t.section_id === section.id)}
          onUpdated={reload}
        />
      ))}
      {tasks.filter(t => !t.section_id).length > 0 && (
        <SectionAccordion
          section={{ id: '', project_id: projectId, name: 'Không có section', color: '#D3D1C7', ord: 999, created_at: '' }}
          tasks={tasks.filter(t => !t.section_id)}
          onUpdated={reload}
        />
      )}
    </div>
  )
}
