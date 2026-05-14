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
