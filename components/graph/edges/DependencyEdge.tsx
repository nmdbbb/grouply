'use client'
import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/types'

interface EdgeData {
  sourceTask?: Task
  onUpdated?: () => void
  [key: string]: unknown
}

export function DependencyEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const supabase = createClient()

  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const edgeData = data as EdgeData
  const isDone = edgeData?.sourceTask?.status === 'done'
  const isDoing = edgeData?.sourceTask?.status === 'doing'

  async function removeDependency() {
    const parts = id.split('-')
    const targetTaskId = parts[parts.length - 1]
    await supabase.from('tasks').update({ blocked_by_id: null }).eq('id', targetTaskId)
    edgeData.onUpdated?.()
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
