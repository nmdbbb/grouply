# Sprint 2: Graph Task Map (ReactFlow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ReactFlow canvas với TaskNode, SectionNode, GhostTaskNode, DependencyEdge, kéo thả, Realtime sync — đây là giao diện làm việc chính của Grouply.

**Architecture:** Zustand `graphStore` giữ toàn bộ nodes/edges/ghostNodes. ReactFlow là pure renderer. Supabase Realtime subscription sync changes từ các tab/user khác. Workspace page tích hợp graph thay thế list view tạm thời ở Sprint 1.

**Prerequisites:** Sprint 1 hoàn thành. Database schema và RLS đã có.

**Tech Stack:** @xyflow/react v12, Zustand, dagre, Supabase Realtime, TypeScript

---

## File Map

```
components/graph/
├── TaskGraph.tsx          # ReactFlow wrapper, subscribe Realtime
├── GraphToolbar.tsx       # Auto-layout, Zoom fit, Graph/List toggle
├── nodes/
│   ├── TaskNode.tsx       # Card node với status, assignee, type
│   ├── GhostTaskNode.tsx  # Preview node từ AI (opacity 0.5, dashed border)
│   └── SectionNode.tsx    # Group node cho section
└── edges/
    └── DependencyEdge.tsx # Custom edge với tooltip xóa

stores/
└── graphStore.ts          # Zustand store: nodes, edges, ghostNodes, ghostEdges

app/project/[id]/
└── page.tsx               # Cập nhật workspace để dùng TaskGraph thay list view
```

---

### Task 1: graphStore (Zustand)

**Files:**
- Create: `stores/graphStore.ts`

- [ ] **Step 1: Viết graphStore**

```typescript
// stores/graphStore.ts
import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, type Node, type Edge, type NodeChange, type EdgeChange } from '@xyflow/react'
import type { Task, Section } from '@/types'

export interface TaskNodeData {
  task: Task
  members: { id: string; name: string; avatar_url: string | null }[]
  onUpdated: () => void
}

export interface SectionNodeData {
  section: Section
  onUpdated: () => void
}

export interface GraphState {
  nodes: Node[]
  edges: Edge[]
  ghostNodes: Node[]
  ghostEdges: Edge[]

  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void

  setGhostPreview: (nodes: Node[], edges: Edge[]) => void
  clearGhost: () => void

  buildFromData: (tasks: Task[], sections: Section[], members: { id: string; name: string; avatar_url: string | null }[], onUpdated: () => void) => void
  updateTaskNode: (task: Task) => void
  removeTaskNode: (taskId: string) => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  ghostNodes: [],
  ghostEdges: [],

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => set(state => ({
    nodes: applyNodeChanges(changes, state.nodes),
  })),

  onEdgesChange: (changes) => set(state => ({
    edges: applyEdgeChanges(changes, state.edges),
  })),

  setGhostPreview: (ghostNodes, ghostEdges) => set({ ghostNodes, ghostEdges }),
  clearGhost: () => set({ ghostNodes: [], ghostEdges: [] }),

  buildFromData: (tasks, sections, members, onUpdated) => {
    const sectionNodes: Node[] = sections.map(s => ({
      id: `section-${s.id}`,
      type: 'sectionNode',
      position: { x: sections.indexOf(s) * 320, y: 0 },
      data: { section: s, onUpdated } as SectionNodeData,
      style: { width: 300, minHeight: 200, backgroundColor: s.color + '80', border: 'none' },
    }))

    const taskNodes: Node[] = tasks.map(t => ({
      id: t.id,
      type: 'taskNode',
      position: { x: t.pos_x, y: t.pos_y },
      parentId: t.section_id ? `section-${t.section_id}` : undefined,
      extent: t.section_id ? 'parent' : undefined,
      data: { task: t, members, onUpdated } as TaskNodeData,
    }))

    const depEdges: Edge[] = tasks
      .filter(t => t.blocked_by_id)
      .map(t => ({
        id: `dep-${t.blocked_by_id}-${t.id}`,
        source: t.blocked_by_id!,
        target: t.id,
        type: 'dependencyEdge',
        data: { sourceTask: tasks.find(x => x.id === t.blocked_by_id) },
      }))

    set({ nodes: [...sectionNodes, ...taskNodes], edges: depEdges })
  },

  updateTaskNode: (task) => set(state => ({
    nodes: state.nodes.map(n =>
      n.id === task.id
        ? { ...n, position: { x: task.pos_x, y: task.pos_y }, data: { ...n.data, task } }
        : n
    ),
  })),

  removeTaskNode: (taskId) => set(state => ({
    nodes: state.nodes.filter(n => n.id !== taskId),
    edges: state.edges.filter(e => e.source !== taskId && e.target !== taskId),
  })),
}))
```

- [ ] **Step 2: Commit**

```bash
git add stores/graphStore.ts
git commit -m "feat: add graphStore Zustand"
```

---

### Task 2: SectionNode

**Files:**
- Create: `components/graph/nodes/SectionNode.tsx`

- [ ] **Step 1: Viết SectionNode**

```typescript
// components/graph/nodes/SectionNode.tsx
'use client'
import { useState, useCallback } from 'react'
import { NodeResizer } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import type { SectionNodeData } from '@/stores/graphStore'

interface Props {
  data: SectionNodeData
  selected: boolean
}

export function SectionNode({ data, selected }: Props) {
  const { section, onUpdated } = data
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const supabase = createClient()

  const handleRename = useCallback(async () => {
    if (name.trim() && name !== section.name) {
      await supabase.from('sections').update({ name: name.trim() }).eq('id', section.id)
      onUpdated()
    }
    setEditing(false)
  }, [name, section.id, section.name, supabase, onUpdated])

  return (
    <div className="w-full h-full relative">
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <div className="absolute top-2 left-3 flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
            className="text-sm font-semibold bg-transparent border-b border-gray-400 outline-none"
          />
        ) : (
          <span
            className="text-sm font-semibold text-gray-700 cursor-pointer"
            onDoubleClick={() => setEditing(true)}
          >
            {section.name}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/nodes/SectionNode.tsx
git commit -m "feat: add SectionNode (ReactFlow GroupNode)"
```

---

### Task 3: TaskNode

**Files:**
- Create: `components/graph/nodes/TaskNode.tsx`

- [ ] **Step 1: Viết TaskNode**

```typescript
// components/graph/nodes/TaskNode.tsx
'use client'
import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/task/StatusBadge'
import { formatDeadline, getInitials } from '@/lib/utils'
import type { TaskNodeData } from '@/stores/graphStore'
import type { TaskStatus } from '@/types'

const STATUS_CYCLE: TaskStatus[] = ['todo', 'doing', 'review', 'done']

const BORDER_COLOR: Record<TaskStatus, string> = {
  todo:    '#D3D1C7',
  doing:   '#378ADD',
  review:  '#854F0B',
  done:    '#0F6E56',
  blocked: '#993C1D',
}

interface Props {
  data: TaskNodeData
}

export const TaskNode = memo(function TaskNode({ data }: Props) {
  const { task, members, onUpdated } = data
  const supabase = createClient()

  async function cycleStatus() {
    const idx = STATUS_CYCLE.indexOf(task.status as TaskStatus)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    onUpdated()
  }

  const assignee = members.find(m => m.id === task.assignee_id)
  const borderColor = BORDER_COLOR[task.status as TaskStatus]
  const isDone = task.status === 'done'

  return (
    <div
      className="bg-white rounded-lg shadow-sm p-3 w-[200px] relative group"
      style={{
        border: `2px solid ${borderColor}`,
        opacity: isDone ? 0.6 : 1,
      }}
    >
      {/* Edge handles — visible on hover */}
      <Handle type="target" position={Position.Top} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Left} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} className="opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-1.5">
        <StatusBadge status={task.status as TaskStatus} onClick={cycleStatus} />
        {task.deadline && (
          <span className="text-xs text-muted-foreground">{formatDeadline(task.deadline)}</span>
        )}
      </div>

      <p className="text-sm font-medium leading-tight line-clamp-2 mb-2">{task.name}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {assignee ? (
            <Avatar className="h-5 w-5">
              <AvatarImage src={assignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">{getInitials(assignee.name)}</AvatarFallback>
            </Avatar>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {task.type}
        </Badge>
      </div>

      {task.status === 'blocked' && (
        <span className="absolute top-1 right-1 text-red-600">⚡</span>
      )}
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/nodes/TaskNode.tsx
git commit -m "feat: add TaskNode component"
```

---

### Task 4: GhostTaskNode

**Files:**
- Create: `components/graph/nodes/GhostTaskNode.tsx`

- [ ] **Step 1: Viết GhostTaskNode**

```typescript
// components/graph/nodes/GhostTaskNode.tsx
import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import type { TaskNodeData } from '@/stores/graphStore'

interface Props {
  data: TaskNodeData
}

export const GhostTaskNode = memo(function GhostTaskNode({ data }: Props) {
  const { task } = data

  return (
    <div
      className="bg-white rounded-lg p-3 w-[200px]"
      style={{
        opacity: 0.5,
        border: '2px dashed #7C3AED',
        pointerEvents: 'none',
      }}
    >
      <p className="text-sm font-medium leading-tight line-clamp-2 mb-2">{task.name}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{task.status}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {task.type}
        </Badge>
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/nodes/GhostTaskNode.tsx
git commit -m "feat: add GhostTaskNode for AI preview"
```

---

### Task 5: DependencyEdge

**Files:**
- Create: `components/graph/edges/DependencyEdge.tsx`

- [ ] **Step 1: Viết DependencyEdge**

```typescript
// components/graph/edges/DependencyEdge.tsx
'use client'
import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/types'

interface EdgeData {
  sourceTask?: Task
  onUpdated?: () => void
}

export function DependencyEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const supabase = createClient()

  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const isDone = (data as EdgeData)?.sourceTask?.status === 'done'
  const isDoing = (data as EdgeData)?.sourceTask?.status === 'doing'

  async function removeDependency() {
    // target node id is the task that has blocked_by_id = source
    // We need to find which task has this edge as blocked_by
    // edge id format: dep-{sourceId}-{targetId}
    const parts = id.split('-')
    const targetTaskId = parts[parts.length - 1]
    await supabase.from('tasks').update({ blocked_by_id: null }).eq('id', targetTaskId)
    ;(data as EdgeData).onUpdated?.()
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isDone ? '#0F6E56' : '#D3D1C7',
          strokeWidth: 2,
          strokeDasharray: isDoing ? '5,5' : undefined,
        }}
        markerEnd="url(#arrow)"
        interactionWidth={20}
        onClick={() => setShowTooltip(v => !v)}
      />
      {showTooltip && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute bg-white border shadow-sm rounded px-2 py-1 text-xs flex items-center gap-2 pointer-events-all"
          >
            <span>Dependency</span>
            <button
              className="text-red-500 hover:text-red-700 font-medium"
              onClick={(e) => { e.stopPropagation(); removeDependency(); setShowTooltip(false) }}
            >
              × Xóa
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/edges/DependencyEdge.tsx
git commit -m "feat: add DependencyEdge with delete tooltip"
```

---

### Task 6: GraphToolbar

**Files:**
- Create: `components/graph/GraphToolbar.tsx`

- [ ] **Step 1: Viết GraphToolbar**

```typescript
// components/graph/GraphToolbar.tsx
'use client'
import { useReactFlow } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/stores/graphStore'
import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'

const NODE_WIDTH = 200
const NODE_HEIGHT = 100

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 60 })

  nodes.forEach(n => {
    if (n.type !== 'sectionNode') {
      g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
  })

  edges.forEach(e => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return nodes.map(n => {
    if (n.type === 'sectionNode') return n
    const pos = g.node(n.id)
    if (!pos) return n
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}

interface Props {
  onToggleView: () => void
  currentView: 'graph' | 'list'
}

export function GraphToolbar({ onToggleView, currentView }: Props) {
  const { fitView } = useReactFlow()
  const { nodes, edges, setNodes } = useGraphStore()

  function handleAutoLayout() {
    const laid = applyDagreLayout(nodes, edges)
    setNodes(laid)
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white rounded-lg shadow-md border px-3 py-1.5">
      <Button variant="ghost" size="sm" onClick={handleAutoLayout}>
        Auto-layout
      </Button>
      <Button variant="ghost" size="sm" onClick={() => fitView({ padding: 0.2 })}>
        Zoom fit
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        variant={currentView === 'graph' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => currentView !== 'graph' && onToggleView()}
      >
        Graph
      </Button>
      <Button
        variant={currentView === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => currentView !== 'list' && onToggleView()}
      >
        List
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/GraphToolbar.tsx
git commit -m "feat: add GraphToolbar with auto-layout and view toggle"
```

---

### Task 7: TaskGraph (Main Canvas)

**Files:**
- Create: `components/graph/TaskGraph.tsx`

- [ ] **Step 1: Viết TaskGraph**

```typescript
// components/graph/TaskGraph.tsx
'use client'
import { useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow, Background, MiniMap, Controls,
  addEdge, type Connection, type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { useGraphStore } from '@/stores/graphStore'
import { GraphToolbar } from './GraphToolbar'
import { TaskNode } from './nodes/TaskNode'
import { GhostTaskNode } from './nodes/GhostTaskNode'
import { SectionNode } from './nodes/SectionNode'
import { DependencyEdge } from './edges/DependencyEdge'
import type { Task, Section } from '@/types'

const nodeTypes = {
  taskNode: TaskNode,
  ghostTaskNode: GhostTaskNode,
  sectionNode: SectionNode,
}

const edgeTypes = {
  dependencyEdge: DependencyEdge,
}

interface Props {
  projectId: string
  userId: string
  initialTasks: Task[]
  initialSections: Section[]
  members: { id: string; name: string; avatar_url: string | null }[]
  onToggleView: () => void
  currentView: 'graph' | 'list'
}

export function TaskGraph({
  projectId, userId, initialTasks, initialSections, members, onToggleView, currentView,
}: Props) {
  const supabase = createClient()
  const { nodes, edges, ghostNodes, ghostEdges, onNodesChange, onEdgesChange, buildFromData, updateTaskNode, removeTaskNode } = useGraphStore()
  const tasksRef = useRef<Task[]>(initialTasks)
  const sectionsRef = useRef<Section[]>(initialSections)

  const reload = useCallback(async () => {
    const [{ data: tasks }, { data: sections }] = await Promise.all([
      supabase.from('tasks').select('*, assignee:profiles(*)').eq('project_id', projectId).order('created_at'),
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
    ])
    tasksRef.current = (tasks ?? []) as Task[]
    sectionsRef.current = (sections ?? []) as Section[]
    buildFromData(tasksRef.current, sectionsRef.current, members, reload)
  }, [projectId, members, buildFromData, supabase])

  // Initial build
  useEffect(() => {
    buildFromData(initialTasks, initialSections, members, reload)
  }, []) // run once

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            removeTaskNode(payload.old.id)
          } else {
            reload()
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections', filter: `project_id=eq.${projectId}` },
        () => reload()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, reload, removeTaskNode, supabase])

  // Save node position after drag
  const handleNodeDragStop: NodeMouseHandler = useCallback(async (_, node) => {
    if (node.type !== 'taskNode') return
    await supabase.from('tasks').update({
      pos_x: node.position.x,
      pos_y: node.position.y,
      section_id: node.parentId ? node.parentId.replace('section-', '') : null,
    }).eq('id', node.id)
  }, [supabase])

  // Create dependency edge
  const handleConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) return

    // Check circular dependency
    const existingEdge = edges.find(e => e.source === connection.target && e.target === connection.source)
    if (existingEdge) return

    await supabase.from('tasks').update({ blocked_by_id: connection.source }).eq('id', connection.target)
    reload()
  }, [edges, supabase, reload])

  // Double-click on pane to create task in section
  const handlePaneDoubleClick = useCallback(async (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    const sectionEl = target.closest('[data-id^="section-"]')
    const sectionId = sectionEl ? sectionEl.getAttribute('data-id')?.replace('section-', '') : null

    const name = prompt('Tên task:')
    if (!name?.trim()) return

    await supabase.from('tasks').insert({
      project_id: projectId,
      section_id: sectionId,
      name: name.trim(),
      created_by: userId,
      pos_x: 50,
      pos_y: 50,
    })
    reload()
  }, [projectId, userId, supabase, reload])

  const allNodes = [...nodes, ...ghostNodes]
  const allEdges = [...edges, ...ghostEdges]

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={allNodes}
        edges={allEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onDoubleClick={handlePaneDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={null}
      >
        <Background />
        <MiniMap position="bottom-right" />
        <Controls position="bottom-left" />
        <GraphToolbar onToggleView={onToggleView} currentView={currentView} />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/graph/TaskGraph.tsx
git commit -m "feat: add TaskGraph with ReactFlow, Realtime sync, drag-to-save"
```

---

### Task 8: Cập nhật Workspace Page

**Files:**
- Modify: `app/project/[id]/page.tsx`

- [ ] **Step 1: Cập nhật workspace để dùng TaskGraph**

```typescript
// app/project/[id]/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WorkspaceClient } from '@/components/WorkspaceClient'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section } from '@/types'

export default async function WorkspacePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase.from('projects').select('*').eq('id', params.id).single()
  if (!project) redirect('/dashboard')

  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', params.id).eq('user_id', user.id).single()
  if (!membership) redirect('/dashboard')

  const [{ data: sections }, { data: tasks }, { data: members }] = await Promise.all([
    supabase.from('sections').select('*').eq('project_id', params.id).order('ord'),
    supabase.from('tasks').select('*, assignee:profiles(*)').eq('project_id', params.id).order('created_at'),
    supabase.from('project_members').select('*, profile:profiles(id, name, avatar_url)').eq('project_id', params.id),
  ])

  const memberProfiles = (members ?? []).map(m => ({
    id: (m.profile as any)?.id ?? '',
    name: (m.profile as any)?.name ?? '',
    avatar_url: (m.profile as any)?.avatar_url ?? null,
    role: m.role,
  }))

  return (
    <WorkspaceClient
      project={project}
      userId={user.id}
      userRole={membership.role as 'owner' | 'member'}
      initialSections={(sections ?? []) as Section[]}
      initialTasks={(tasks ?? []) as Task[]}
      members={memberProfiles}
    />
  )
}
```

- [ ] **Step 2: Tạo WorkspaceClient component**

```typescript
// components/WorkspaceClient.tsx
'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { TaskList } from '@/components/task/TaskList'
import { InviteButton } from '@/components/project/InviteButton'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section, Project } from '@/types'

// ReactFlow requires client-side only
const TaskGraph = dynamic(() => import('@/components/graph/TaskGraph').then(m => ({ default: m.TaskGraph })), { ssr: false })

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
            members={members}
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
```

- [ ] **Step 3: Commit**

```bash
git add app/project/[id]/page.tsx components/WorkspaceClient.tsx
git commit -m "feat: integrate TaskGraph into workspace with graph/list toggle"
```

---

### Task 9: Sprint 2 Verification

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: không có lỗi type.

- [ ] **Step 2: End-to-end smoke test thủ công — Mở 2 tab cùng lúc**

Tab 1: `/project/[id]` — view graph
Tab 2: `/project/[id]` — view graph

Checklist:
1. Graph hiện SectionNode (màu tím nhạt) và TaskNode bên trong ✓
2. Kéo TaskNode → thả → node ở vị trí mới. Reload page → node vẫn ở vị trí đó (pos lưu DB) ✓
3. Tab 1 kéo task → Tab 2 thấy node move trong vòng 500ms (Realtime) ✓
4. Click status badge → cycle status. Tab 2 thấy badge đổi màu ✓
5. Hover node → 4 edge handles xuất hiện ✓
6. Kéo từ handle của node A → thả vào node B → DependencyEdge xuất hiện ✓
7. Click DependencyEdge → tooltip "Dependency · × Xóa" hiện ra. Click Xóa → edge biến mất ✓
8. Double-click vùng trống → prompt tên task → task mới xuất hiện trên graph ✓
9. Auto-layout button → nodes được sắp xếp theo dagre ✓
10. Graph/List toggle → switch view ✓
11. MiniMap hiện ở góc phải dưới ✓

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: sprint 2 complete — ReactFlow graph with Realtime sync"
```
