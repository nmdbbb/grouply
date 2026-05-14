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
