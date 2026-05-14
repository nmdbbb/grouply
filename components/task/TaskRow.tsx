'use client'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from './StatusBadge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatDeadline, getInitials } from '@/lib/utils'
import type { Task, TaskStatus } from '@/types'

const STATUS_CYCLE: TaskStatus[] = ['todo', 'doing', 'review', 'done']

interface Props {
  task: Task
  onUpdated: () => void
}

export function TaskRow({ task, onUpdated }: Props) {
  const supabase = createClient()

  async function cycleStatus() {
    const idx = STATUS_CYCLE.indexOf(task.status as TaskStatus)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    onUpdated()
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b last:border-0">
      <StatusBadge status={task.status as TaskStatus} onClick={cycleStatus} />
      <span className="flex-1 text-sm truncate">{task.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {task.type}
      </span>
      {task.deadline && (
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDeadline(task.deadline)}
        </span>
      )}
      {task.assignee && (
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarImage src={task.assignee.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">{getInitials(task.assignee.name)}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
