import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { TaskHistory } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  created: 'tạo task',
  status_changed: 'đổi status',
  assigned: 'assign',
  updated: 'cập nhật',
  deleted: 'xóa task',
}

interface Props {
  history: TaskHistory[]
}

export function ActivityLog({ history }: Props) {
  if (history.length === 0) {
    return <p className="text-xs text-muted-foreground">Chưa có hoạt động nào.</p>
  }

  return (
    <ul className="space-y-2">
      {history.map(h => (
        <li key={h.id} className="flex items-start gap-2 text-xs">
          <div className="h-1.5 w-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
          <div>
            <span className="font-medium">{(h as any).profile?.name ?? 'Ai đó'}</span>
            {' '}
            <span className="text-muted-foreground">{ACTION_LABELS[h.action] ?? h.action}</span>
            {h.new_value && h.action === 'status_changed' && (
              <span className="text-muted-foreground"> → {String((h.new_value as any).status ?? '')}</span>
            )}
            <span className="text-muted-foreground ml-1">
              · {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: vi })}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
