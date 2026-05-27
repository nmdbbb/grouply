'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
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
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Task, Section, Project, ChecklistItem } from '@/types'
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
  initialChecklistItems: ChecklistItem[]
  members: { id: string; name: string; avatar_url: string | null; role: string }[]
  aiContext: ProjectContext
  currentUserName: string
}

export function WorkspaceClient({
  project, userId, userRole, initialSections, initialTasks, initialChecklistItems,
  members, aiContext, currentUserName,
}: Props) {
  const [view, setView] = useState<'graph' | 'list' | 'timeline' | 'docs'>('graph')
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [liveSections, setLiveSections] = useState(initialSections)
  const [liveTasks, setLiveTasks] = useState(initialTasks)
  const [deleting, setDeleting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatWidth, setChatWidth] = useState(320)
  useEffect(() => setMounted(true), [])

  const resizeSidebar = useCallback((delta: number) => {
    setSidebarWidth(w => Math.max(160, Math.min(480, w + delta)))
  }, [])

  const resizeChat = useCallback((delta: number) => {
    setChatWidth(w => Math.max(240, Math.min(600, w - delta)))
  }, [])

  const router = useRouter()
  const supabase = createClient()

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

  const reloadData = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('sections').select('*').eq('project_id', project.id).order('ord'),
      supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url)').eq('project_id', project.id).order('created_at'),
    ])
    if (s) setLiveSections(s as Section[])
    if (t) setLiveTasks(t as Task[])
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const searchParams = useSearchParams()
  const [pendingBrief, setPendingBrief] = useState<string | null>(null)

  function handleOpenDrawer(task: Task) {
    setDrawerTask(task)
    setDrawerOpen(true)
  }

  function handleAnalyzeDoc(text: string, fileName: string) {
    // Switch to graph view where ChatPanel is visible; user interacts with AI through ChatPanel
    setView('graph')
  }

  useEffect(() => {
    if (searchParams.get('parseBrief') !== '1') return
    const brief = localStorage.getItem(`grouply-brief-${project.id}`)
    if (!brief) return
    localStorage.removeItem(`grouply-brief-${project.id}`)
    setPendingBrief(brief)
    setView('graph')
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
          {/* Tab switcher */}
          <div className="flex items-center border rounded-lg overflow-hidden text-xs">
            {(['graph', 'list', 'timeline', 'docs'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); reloadData() }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  view === v ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-gray-50'
                }`}
              >
                {v === 'graph' ? '🗺 Graph' : v === 'list' ? '☰ List' : v === 'timeline' ? '📅 Timeline' : '📁 Tài liệu'}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">Deadline: {formatDeadline(project.deadline)}</span>
          {userRole === 'owner' && <InviteButton projectId={project.id} />}
          {mounted && userRole === 'owner' && (
            <button
              onClick={handleDeleteProject}
              disabled={deleting}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
            >
              {deleting ? 'Đang xóa...' : 'Xóa project'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Content row */}
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
                  onOpenDrawer={handleOpenDrawer}
                />
              </div>
              <ResizableDivider onResize={resizeChat} />
              <div style={{ width: chatWidth, minWidth: chatWidth }} className="shrink-0 overflow-hidden">
                <ChatPanel
                  projectId={project.id}
                  context={aiContext}
                  currentUserName={currentUserName}
                  currentUserRole={userRole}
                  userId={userId}
                  onAfterCommit={reloadData}
                />
              </div>
            </div>
          )}

          {view === 'list' && (
            <div className="flex-1 overflow-auto min-w-0">
              <div className="max-w-4xl mx-auto px-6 py-6">
                <TaskList
                  projectId={project.id}
                  userId={userId}
                  initialSections={liveSections}
                  initialTasks={liveTasks}
                />
              </div>
            </div>
          )}

          {view === 'timeline' && (
            <div className="flex-1 overflow-hidden min-w-0">
              <TimelineView
                project={project}
                tasks={liveTasks}
                sections={liveSections}
                userId={userId}
                onTaskClick={handleOpenDrawer}
              />
            </div>
          )}

          {view === 'docs' && (
            <div className="flex flex-1 overflow-hidden min-w-0">
              <div className="flex-1 overflow-hidden bg-gray-50 min-w-0">
                <DocumentsTab
                  projectId={project.id}
                  onAnalyze={handleAnalyzeDoc}
                />
              </div>
              <ResizableDivider onResize={resizeChat} />
              <div style={{ width: chatWidth, minWidth: chatWidth }} className="shrink-0 overflow-hidden">
                <ChatPanel
                  projectId={project.id}
                  context={aiContext}
                  currentUserName={currentUserName}
                  currentUserRole={userRole}
                  userId={userId}
                  onAfterCommit={reloadData}
                />
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
