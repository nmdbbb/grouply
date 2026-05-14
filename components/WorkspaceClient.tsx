'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { TaskList } from '@/components/task/TaskList'
import { InviteButton } from '@/components/project/InviteButton'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { formatDeadline } from '@/lib/utils'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import type { Task, Section, Project } from '@/types'
import type { ProjectContext } from '@/lib/ai/context'

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
  aiContext: ProjectContext
  currentUserName: string
}

export function WorkspaceClient({ project, userId, userRole, initialSections, initialTasks, members, aiContext, currentUserName }: Props) {
  const [view, setView] = useState<'graph' | 'list'>('graph')

  const searchParams = useSearchParams()
  const { addMessage, setLoading, setPending } = useChatStore()
  const { setGhostPreview } = useGraphStore()

  useEffect(() => {
    if (searchParams.get('parseBrief') !== '1') return
    const brief = localStorage.getItem(`grouply-brief-${project.id}`)
    if (!brief) return
    localStorage.removeItem(`grouply-brief-${project.id}`)

    async function sendBrief() {
      setLoading(true)
      addMessage({ role: 'user', content: 'Phân tích đề bài và tạo kế hoạch...' })
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: project.id,
            message: `Hãy phân tích đề bài sau và đề xuất checklist items + task list cho nhóm ${members.length} người, deadline ${project.deadline}:\n\n${brief}`,
            conversation_history: [],
          }),
        })
        const data = await res.json()
        if (data.text) addMessage({ role: 'assistant', content: data.text })
        if (data.tool_calls?.length > 0 && data.preview) {
          setPending(data.tool_calls, data.preview)
          const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(data.tool_calls, aiContext)
          setGhostPreview(ghostNodes, ghostEdges)
        }
      } catch {}
      setLoading(false)
    }

    sendBrief()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="flex h-full overflow-hidden">
            <div className="flex-1 relative overflow-hidden">
              <TaskGraph
                projectId={project.id}
                userId={userId}
                initialTasks={initialTasks}
                initialSections={initialSections}
                members={graphMembers}
                onToggleView={() => setView('list')}
                currentView="graph"
              />
            </div>
            <div className="w-80 shrink-0">
              <ChatPanel
                projectId={project.id}
                context={aiContext}
                currentUserName={currentUserName}
                currentUserRole={userRole}
              />
            </div>
          </div>
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
