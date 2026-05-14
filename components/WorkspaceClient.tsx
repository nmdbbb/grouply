'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { TaskList } from '@/components/task/TaskList'
import { InviteButton } from '@/components/project/InviteButton'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section, Project } from '@/types'

const TaskGraph = dynamic(
  () => import('@/components/graph/TaskGraph').then(m => ({ default: m.TaskGraph })),
  { ssr: false }
)

interface Props {
  project: Project
  userId: string
  userRole: 'owner' | 'member'
  initialSections: Section[]
  initialTasks: Task[]
  members: { id: string; name: string; avatar_url: string | null; role: string }[]
}

export function WorkspaceClient({ project, userId, userRole, initialSections, initialTasks, members }: Props) {
  const [view, setView] = useState<'graph' | 'list'>('graph')

  const graphMembers = members.map(m => ({ id: m.id, name: m.name, avatar_url: m.avatar_url }))

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold">Grouply</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{project.name}</span>
          {project.subject && <span className="text-sm text-muted-foreground">{project.subject}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Deadline: {formatDeadline(project.deadline)}</span>
          {userRole === 'owner' && <InviteButton projectId={project.id} />}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {view === 'graph' ? (
          <TaskGraph
            projectId={project.id}
            userId={userId}
            initialTasks={initialTasks}
            initialSections={initialSections}
            members={graphMembers}
            onToggleView={() => setView('list')}
            currentView="graph"
          />
        ) : (
          <div className="h-full overflow-auto">
            <div className="flex justify-between items-center px-6 py-3 border-b bg-white">
              <h2 className="font-medium">List View</h2>
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setView('graph')}
              >
                → Graph view
              </button>
            </div>
            <div className="max-w-4xl mx-auto px-6 py-6">
              <TaskList
                projectId={project.id}
                userId={userId}
                initialSections={initialSections}
                initialTasks={initialTasks}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
