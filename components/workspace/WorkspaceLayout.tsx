'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TaskList } from '@/components/task/TaskList'
import { InviteButton } from '@/components/project/InviteButton'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ChecklistSidebar } from '@/components/checklist/ChecklistSidebar'
import { ContributionBar } from '@/components/contribution/ContributionBar'
import { TaskDrawer } from '@/components/task/TaskDrawer'
import { DocumentsTab } from '@/components/documents/DocumentsTab'
import { ResizableDivider } from '@/components/ui/ResizableDivider'
import { TimelineView } from '@/components/timeline/TimelineView'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section, ChecklistItem, Project } from '@/types'
import type { ProjectContext } from '@/lib/ai/context'

const TaskGraph = dynamic(
  () => import('@/components/graph/TaskGraph').then(m => ({ default: m.TaskGraph })),
  { ssr: false }
)

interface Props {
  project: Project
  userId: string
  userRole: 'owner' | 'member'
  liveSections: Section[]
  liveTasks: Task[]
  initialChecklistItems: ChecklistItem[]
  members: { id: string; name: string; avatar_url: string | null; role: string }[]
  aiContext: ProjectContext
  currentUserName: string
  reloadData: () => Promise<void>
}

export function WorkspaceLayout({
  project, userId, userRole, liveSections, liveTasks,
  initialChecklistItems, members, aiContext, currentUserName, reloadData,
}: Props) {
  const [view, setView] = useState<'graph' | 'list' | 'timeline' | 'docs'>('graph')
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatWidth, setChatWidth] = useState(320)
  const router = useRouter()

  useEffect(() => setMounted(true), [])

  const resizeSidebar = useCallback((delta: number) => {
    setSidebarWidth(w => Math.max(160, Math.min(480, w + delta)))
  }, [])

  const resizeChat = useCallback((delta: number) => {
    setChatWidth(w => Math.max(240, Math.min(600, w - delta)))
  }, [])

  async function handleDeleteProject() {
    if (!confirm(`Xóa project "${project.name}"? Toàn bộ tasks, sections và dữ liệu sẽ bị xóa vĩnh viễn.`)) return
    setDeleting(true)
    const res = await fetch('/api/project/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id }),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      alert('Xóa thất bại. Thử lại.')
      setDeleting(false)
    }
  }

  const graphMembers = members.map(m => ({ id: m.id, name: m.name, avatar_url: m.avatar_url }))

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="bg-white border-b px-5 py-2.5 flex items-center justify-between shrink-0 shadow-[0_1px_0_0_#E5E7EB]">
        <div className="flex items-center gap-2.5">
          <span
            className="text-sm font-bold tracking-tight"
            style={{ color: '#5B5BD6' }}
          >
            Grouply
          </span>
          <span className="text-border text-sm">/</span>
          <span className="text-sm font-semibold text-gray-800">{project.name}</span>
          {project.subject && (
            <span className="hidden sm:inline text-xs text-muted-foreground border rounded-full px-2 py-0.5 bg-muted/50">
              {project.subject}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-muted rounded-lg p-0.5 text-xs">
            {(['graph', 'list', 'timeline', 'docs'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  view === v
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-muted-foreground hover:text-gray-700'
                }`}
              >
                {v === 'graph' ? 'Graph' : v === 'list' ? 'List' : v === 'timeline' ? 'Timeline' : 'Tài liệu'}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Deadline: <span className="font-medium text-gray-700">{formatDeadline(project.deadline)}</span>
          </span>
          <Link
            href={`/project/${project.id}/members`}
            className="text-xs font-medium text-muted-foreground hover:text-gray-700 px-2 py-1 rounded-md hover:bg-muted transition-colors"
          >
            Thành viên
          </Link>
          {userRole === 'owner' && <InviteButton projectId={project.id} />}
          {mounted && userRole === 'owner' && (
            <button
              onClick={handleDeleteProject}
              disabled={deleting}
              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
            >
              {deleting ? 'Đang xóa...' : 'Xóa'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex flex-1 overflow-hidden">
          <div style={{ width: sidebarCollapsed ? 32 : sidebarWidth, minWidth: sidebarCollapsed ? 32 : sidebarWidth }} className="shrink-0 overflow-hidden transition-none">
            <ChecklistSidebar
              projectId={project.id}
              initialItems={initialChecklistItems}
              initialTasks={liveTasks}
              onCollapsedChange={setSidebarCollapsed}
            />
          </div>

          {!sidebarCollapsed && <ResizableDivider onResize={resizeSidebar} />}

          {view === 'graph' && (
            <div className="flex flex-1 overflow-hidden min-w-0">
              <div className="flex-1 relative overflow-hidden min-w-0">
                <TaskGraph
                  projectId={project.id}
                  userId={userId}
                  initialTasks={liveTasks}
                  initialSections={liveSections}
                  members={graphMembers}
                  onToggleView={() => setView('list')}
                  currentView="graph"
                  onOpenDrawer={(task: Task) => { setDrawerTask(task); setDrawerOpen(true) }}
                />
              </div>
              <ResizableDivider onResize={resizeChat} />
              <div style={{ width: chatWidth, minWidth: chatWidth }} className="shrink-0 overflow-hidden">
                <ChatPanel projectId={project.id} context={aiContext} currentUserName={currentUserName} currentUserRole={userRole} userId={userId} onAfterCommit={reloadData} />
              </div>
            </div>
          )}

          {view === 'list' && (
            <div className="flex-1 overflow-auto min-w-0">
              <div className="max-w-4xl mx-auto px-6 py-6">
                <TaskList projectId={project.id} userId={userId} initialSections={liveSections} initialTasks={liveTasks} />
              </div>
            </div>
          )}

          {view === 'timeline' && (
            <div className="flex-1 overflow-hidden min-w-0">
              <TimelineView project={project} tasks={liveTasks} sections={liveSections} userId={userId} onTaskClick={(task: Task) => { setDrawerTask(task); setDrawerOpen(true) }} />
            </div>
          )}

          {view === 'docs' && (
            <div className="flex flex-1 overflow-hidden min-w-0">
              <div className="flex-1 overflow-hidden bg-gray-50 min-w-0">
                <DocumentsTab projectId={project.id} onAnalyze={() => setView('graph')} />
              </div>
              <ResizableDivider onResize={resizeChat} />
              <div style={{ width: chatWidth, minWidth: chatWidth }} className="shrink-0 overflow-hidden">
                <ChatPanel projectId={project.id} context={aiContext} currentUserName={currentUserName} currentUserRole={userRole} userId={userId} onAfterCommit={reloadData} />
              </div>
            </div>
          )}

        </div>

        <ContributionBar projectId={project.id} members={graphMembers} />
      </main>

      <TaskDrawer
        task={drawerTask}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sections={liveSections}
        checklistItems={initialChecklistItems}
        members={members.map(m => ({ ...m, role: m.role }))}
        currentUserId={userId}
        currentUserRole={userRole}
        projectId={project.id}
        onUpdated={reloadData}
        onAskAI={() => setDrawerOpen(false)}
      />
    </div>
  )
}
