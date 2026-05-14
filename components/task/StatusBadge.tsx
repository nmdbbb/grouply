import type { TaskStatus } from '@/types'

const CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  todo:    { label: 'Chưa làm', className: 'bg-gray-100 text-gray-700' },
  doing:   { label: 'Đang làm', className: 'bg-blue-100 text-blue-700' },
  review:  { label: 'Review',   className: 'bg-amber-100 text-amber-800' },
  done:    { label: 'Xong',     className: 'bg-teal-100 text-teal-700' },
  blocked: { label: 'Bị block', className: 'bg-red-100 text-red-700' },
}

interface Props {
  status: TaskStatus
  onClick?: () => void
}

export function StatusBadge({ status, onClick }: Props) {
  const { label, className } = CONFIG[status]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer select-none ${className}`}
      onClick={onClick}
    >
      {label}
    </span>
  )
}
