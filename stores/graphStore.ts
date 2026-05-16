// stores/graphStore.ts
import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, type Node, type Edge, type NodeChange, type EdgeChange } from '@xyflow/react'
import type { Task, Section } from '@/types'

export interface TaskNodeData {
  task: Task
  members: { id: string; name: string; avatar_url: string | null }[]
  currentUserId: string
  onUpdated: () => void
  onOpenDrawer: (task: Task) => void
  [key: string]: unknown
}

export interface SectionNodeData {
  section: Section
  onUpdated: () => void
  [key: string]: unknown
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

  buildFromData: (tasks: Task[], sections: Section[], members: { id: string; name: string; avatar_url: string | null }[], currentUserId: string, onUpdated: () => void, onOpenDrawer: (task: Task) => void) => void
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

  buildFromData: (tasks, sections, members, currentUserId, onUpdated, onOpenDrawer) => {
    const sectionNodes: Node[] = sections.map((s, i) => {
      const sectionTaskCount = tasks.filter(t => t.section_id === s.id).length
      const dynamicHeight = Math.max(220, 80 + sectionTaskCount * 90)
      return {
        id: `section-${s.id}`,
        type: 'sectionNode',
        position: { x: i * 320, y: 0 },
        data: { section: s, onUpdated } as SectionNodeData,
        style: { width: 300, height: dynamicHeight, backgroundColor: s.color + '80', border: 'none' },
      }
    })

    const taskNodes: Node[] = tasks.map(t => ({
      id: t.id,
      type: 'taskNode',
      position: { x: t.pos_x, y: t.pos_y },
      parentId: t.section_id ? `section-${t.section_id}` : undefined,
      data: { task: t, members, currentUserId, onUpdated, onOpenDrawer } as TaskNodeData,
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
