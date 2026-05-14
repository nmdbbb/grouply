'use client'
import { useState } from 'react'
import { TaskRow } from '@/components/task/TaskRow'
import type { Section, Task } from '@/types'

interface Props {
  section: Section
  tasks: Task[]
  onUpdated: () => void
}

export function SectionAccordion({ section, tasks, onUpdated }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border rounded-lg overflow-hidden mb-3">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
        style={{ borderLeft: `4px solid ${section.color}` }}
        onClick={() => setOpen(o => !o)}
      >
        <span>{section.name}</span>
        <span className="text-muted-foreground text-xs">{tasks.length} tasks {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div>
          {tasks.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Chưa có task nào.</p>
          ) : (
            tasks.map(t => <TaskRow key={t.id} task={t} onUpdated={onUpdated} />)
          )}
        </div>
      )}
    </div>
  )
}
