import { memo } from 'react'
import type { TaskNodeData } from '@/stores/graphStore'

interface Props {
  data: TaskNodeData
}

export const GhostTaskNode = memo(function GhostTaskNode({ data }: Props) {
  const { task } = data

  return (
    <div
      className="rounded-xl w-[200px] overflow-hidden"
      style={{
        opacity: 0.6,
        border: '1.5px dashed #5B5BD6',
        background: 'linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 100%)',
        boxShadow: '0 0 0 3px rgba(91,91,214,0.08)',
        pointerEvents: 'none',
      }}
    >
      <div className="h-0.5 w-full" style={{ backgroundColor: '#5B5BD6', opacity: 0.5 }} />
      <div className="p-2.5">
        <p className="text-[13px] font-medium leading-snug line-clamp-2 mb-1.5 text-indigo-900">{task.name}</p>
        <span className="text-[10px] font-medium text-indigo-500 uppercase tracking-wide">
          AI đề xuất · {task.type}
        </span>
      </div>
    </div>
  )
})
