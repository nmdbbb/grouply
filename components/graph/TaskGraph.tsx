'use client'
import { useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow, Background, MiniMap, Controls,
  type Connection, type NodeMouseHandler,
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
  onOpenDrawer: (task: Task) => void
}

export function TaskGraph({
  projectId, userId, initialTasks, initialSections, members, onToggleView, currentView, onOpenDrawer,
}: Props) {
  const supabase = createClient()
  const { nodes, edges, ghostNodes, ghostEdges, onNodesChange, onEdgesChange, buildFromData, removeTaskNode } = useGraphStore()
  const membersRef = useRef(members)
  membersRef.current = members

  const reload = useCallback(async () => {
    const [{ data: tasks }, { data: sections }] = await Promise.all([
      supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, avatar_url)').eq('project_id', projectId).order('created_at'),
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
    ])
    buildFromData((tasks ?? []) as Task[], (sections ?? []) as Section[], membersRef.current, userId, reload, onOpenDrawer)
  }, [projectId, buildFromData, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const dataKey = `${initialTasks.length}-${initialSections.length}`

  useEffect(() => {
    buildFromData(initialTasks, initialSections, membersRef.current, userId, reload, onOpenDrawer)
  }, [dataKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            removeTaskNode((payload.old as { id: string }).id)
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

  const handleNodeDragStop: NodeMouseHandler = useCallback(async (_, node) => {
    if (node.type !== 'taskNode') return
    await supabase.from('tasks').update({
      pos_x: node.position.x,
      pos_y: node.position.y,
      section_id: node.parentId ? node.parentId.replace('section-', '') : null,
    }).eq('id', node.id)
  }, [supabase])

  const handleConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) return

    const existingEdge = edges.find(e => e.source === connection.target && e.target === connection.source)
    if (existingEdge) return

    await supabase.from('tasks').update({ blocked_by_id: connection.source }).eq('id', connection.target)
    reload()
  }, [edges, supabase, reload])

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
