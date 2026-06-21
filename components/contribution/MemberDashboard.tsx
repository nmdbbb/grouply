'use client'
import { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { Task, Section, TaskStatus } from '@/types'

interface Member {
  id: string
  name: string
  avatar_url: string | null
  role: string
}

interface Props {
  members: Member[]
  tasks: Task[]
  sections?: Section[]
  currentUserId?: string
  onTaskClick?: (task: Task) => void
}

const STATUS_ORDER: TaskStatus[] = ['doing', 'review', 'blocked', 'todo', 'done']

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  doing:   { label: 'Đang làm', bg: 'bg-blue-100',   text: 'text-blue-700',  dot: 'bg-blue-500'  },
  review:  { label: 'Review',   bg: 'bg-amber-100',  text: 'text-amber-700', dot: 'bg-amber-400' },
  blocked: { label: 'Bị block', bg: 'bg-red-100',    text: 'text-red-700',   dot: 'bg-red-500'   },
  todo:    { label: 'Chưa làm', bg: 'bg-gray-100',   text: 'text-gray-600',  dot: 'bg-gray-300'  },
  done:    { label: 'Xong',     bg: 'bg-teal-100',   text: 'text-teal-700',  dot: 'bg-teal-500'  },
}

const AVATAR_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-teal-100',   text: 'text-teal-700'   },
  { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  { bg: 'bg-rose-100',   text: 'text-rose-700'   },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-cyan-100',   text: 'text-cyan-700'   },
]

export function MemberDashboard({ members, tasks, sections, currentUserId, onTaskClick }: Props) {
  const stats = useMemo(() => {
    const totalDone = tasks.filter(t => t.status === 'done').length

    const memberStats = members.map((m, idx) => {
      const mine = tasks.filter(t => t.assignee_id === m.id)
      const byStatus = Object.fromEntries(
        (['todo', 'doing', 'review', 'done', 'blocked'] as TaskStatus[]).map(s => [
          s, mine.filter(t => t.status === s),
        ])
      ) as Record<TaskStatus, Task[]>

      const total = mine.length
      const done = byStatus.done.length
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      const contributePct = totalDone > 0 ? Math.round((done / totalDone) * 100) : 0
      const active = byStatus.doing.length + byStatus.review.length

      const sorted = [...mine].sort(
        (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      )

      return {
        member: m,
        byStatus,
        total,
        done,
        active,
        pct,
        contributePct,
        sorted,
        color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
        isMe: m.id === currentUserId,
      }
    }).sort((a, b) => b.done - a.done || b.active - a.active)

    const unassigned = tasks.filter(t => !t.assignee_id)
    const totalDoneAll = tasks.filter(t => t.status === 'done').length
    const totalActive = tasks.filter(t => t.status === 'doing' || t.status === 'review').length

    return { memberStats, unassigned, totalDone: totalDoneAll, totalActive }
  }, [members, tasks, currentUserId])

  const sectionMap = useMemo(
    () => Object.fromEntries((sections ?? []).map(s => [s.id, s.name])),
    [sections]
  )

  return (
    <div className="flex-1 overflow-auto">
      {/* Summary bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-6">
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-gray-900">{members.length}</span>
          <span className="text-xs text-gray-500">Thành viên</span>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-teal-600">{stats.totalDone}</span>
          <span className="text-xs text-gray-500">Task hoàn thành</span>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-blue-600">{stats.totalActive}</span>
          <span className="text-xs text-gray-500">Đang thực hiện</span>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-amber-500">{stats.unassigned.length}</span>
          <span className="text-xs text-gray-500">Chưa được giao</span>
        </div>

        {/* Leaderboard mini */}
        <div className="ml-auto flex items-center gap-2">
          {stats.memberStats.slice(0, 3).map((s, i) => (
            <div key={s.member.id} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">#{i + 1}</span>
              <Avatar className="h-6 w-6">
                <AvatarImage src={s.member.avatar_url ?? undefined} />
                <AvatarFallback className={`text-[9px] font-bold ${s.color.bg} ${s.color.text}`}>
                  {getInitials(s.member.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-gray-700">{s.done} done</span>
              {i < 2 && <span className="text-gray-300">·</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Member cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {stats.memberStats.map(({ member, byStatus, total, done, active, pct, contributePct, sorted, color, isMe }) => (
            <div
              key={member.id}
              className={`bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden ${isMe ? 'border-indigo-200 ring-1 ring-indigo-200' : 'border-gray-200'}`}
            >
              {/* Card header */}
              <div className="px-5 pt-5 pb-4 flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className={`text-sm font-bold ${color.bg} ${color.text}`}>
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                    {isMe && (
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-600 rounded-full px-2 py-0.5 shrink-0">Bạn</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{member.role === 'owner' ? 'Chủ nhóm' : 'Thành viên'}</p>
                </div>
                {active > 0 && (
                  <span className="shrink-0 flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                    {active} active
                  </span>
                )}
              </div>

              {/* Progress + contribution */}
              <div className="px-5 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">{done}/{total} task hoàn thành</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Đóng góp</span>
                    <span className="text-xs font-bold text-indigo-600">{contributePct}%</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{pct}% hoàn thành cá nhân</p>
              </div>

              {/* Status breakdown */}
              <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-5 gap-1">
                {(['doing', 'review', 'blocked', 'todo', 'done'] as TaskStatus[]).map(s => (
                  <div key={s} className="flex flex-col items-center gap-1">
                    <span className={`text-sm font-bold ${byStatus[s].length > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                      {byStatus[s].length}
                    </span>
                    <span className={`text-[9px] font-medium px-1 py-0.5 rounded-full text-center leading-tight ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text}`}>
                      {STATUS_CONFIG[s].label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Task list */}
              <div className="px-5 py-3 flex flex-col gap-2 flex-1">
                {sorted.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">Chưa được giao task nào</p>
                ) : (
                  sorted.slice(0, 6).map(task => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick?.(task)}
                      className="flex items-start gap-2 text-left group w-full"
                    >
                      <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[task.status].dot}`} />
                      <span className="text-xs text-gray-700 leading-snug group-hover:text-indigo-600 transition-colors line-clamp-1 flex-1">
                        {task.name}
                      </span>
                      {task.section_id && sectionMap[task.section_id] && (
                        <span className="shrink-0 text-[9px] text-gray-400 truncate max-w-[70px]">
                          {sectionMap[task.section_id]}
                        </span>
                      )}
                    </button>
                  ))
                )}
                {sorted.length > 6 && (
                  <p className="text-[10px] text-gray-400">+{sorted.length - 6} task khác</p>
                )}
              </div>

              {/* Blocked warning */}
              {byStatus.blocked.length > 0 && (
                <div className="px-5 py-2.5 bg-red-50 border-t border-red-100">
                  <p className="text-xs font-semibold text-red-600">
                    ⚠ {byStatus.blocked.length} task bị block
                    {byStatus.blocked.map(t => t.name).slice(0, 1).map(n => `: ${n}`)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Unassigned section */}
        {stats.unassigned.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              Chưa được giao — {stats.unassigned.length} task
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {stats.unassigned.map(task => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick?.(task)}
                  className="bg-white border border-dashed border-gray-300 rounded-lg px-3 py-2.5 flex items-center gap-2.5 text-left hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[task.status].dot}`} />
                  <span className="text-xs text-gray-600 truncate group-hover:text-indigo-700 flex-1">
                    {task.name}
                  </span>
                  <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_CONFIG[task.status].bg} ${STATUS_CONFIG[task.status].text}`}>
                    {STATUS_CONFIG[task.status].label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
