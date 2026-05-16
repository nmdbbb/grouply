'use client'
import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/task/StatusBadge'
import { ClaimBadge } from '@/components/task/ClaimBadge'
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
  const { task, members, currentUserId, onUpdated, onOpenDrawer } = data
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
      className="bg-white rounded-lg shadow-sm p-3 w-[200px] relative group cursor-pointer"
      style={{
        border: `2px solid ${borderColor}`,
        opacity: isDone ? 0.6 : 1,
      }}
      onClick={() => onOpenDrawer(task)}
    >
      <Handle type="target" position={Position.Top} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Left} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} className="opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-1.5">
        <span onClick={e => e.stopPropagation()}>
          <StatusBadge status={task.status as TaskStatus} onClick={cycleStatus} />
        </span>
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

      <div className="mt-1.5" onClick={e => e.stopPropagation()}>
        <ClaimBadge
          taskId={task.id}
          currentUserId={currentUserId}
          assigneeId={task.assignee_id}
        />
      </div>

      {task.status === 'blocked' && (
        <span className="absolute top-1 right-1 text-red-600">⚡</span>
      )}
    </div>
  )
})
