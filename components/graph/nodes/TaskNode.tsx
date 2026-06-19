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

const STATUS_COLOR: Record<TaskStatus, { border: string; top: string }> = {
  todo:    { border: '#E2E0D6', top: '#C8C5B8' },
  doing:   { border: '#93C5FD', top: '#3B82F6' },
  review:  { border: '#FCD34D', top: '#D97706' },
  done:    { border: '#6EE7B7', top: '#059669' },
  blocked: { border: '#FCA5A5', top: '#DC2626' },
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
  const colors = STATUS_COLOR[task.status as TaskStatus] ?? STATUS_COLOR.todo
  const isDone = task.status === 'done'

  return (
    <div
      className="bg-white rounded-xl w-[200px] relative group cursor-pointer overflow-hidden"
      style={{
        border: `1.5px solid ${colors.border}`,
        boxShadow: '0 1px 4px 0 rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
        opacity: isDone ? 0.65 : 1,
      }}
      onClick={() => onOpenDrawer(task)}
    >
      {/* status indicator strip at top */}
      <div className="h-0.5 w-full" style={{ backgroundColor: colors.top }} />

      <div className="p-2.5">
        <Handle type="target" position={Position.Top} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        <Handle type="source" position={Position.Bottom} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        <Handle type="target" position={Position.Left} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        <Handle type="source" position={Position.Right} className="opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="flex items-center justify-between mb-1.5">
          <span onClick={e => e.stopPropagation()}>
            <StatusBadge status={task.status as TaskStatus} onClick={cycleStatus} />
          </span>
          {task.deadline && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{formatDeadline(task.deadline)}</span>
          )}
        </div>

        <p className="text-[13px] font-medium leading-snug line-clamp-2 mb-2 text-gray-800">{task.name}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {assignee ? (
              <Avatar className="h-5 w-5">
                <AvatarImage src={assignee.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px] font-medium bg-indigo-100 text-indigo-700">
                  {getInitials(assignee.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="text-xs text-muted-foreground/60">—</span>
            )}
          </div>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
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
          <span className="absolute top-2 right-2 text-red-500 text-xs leading-none">⚡</span>
        )}
      </div>
    </div>
  )
})
