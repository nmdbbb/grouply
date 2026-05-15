'use client'
import { useRef, useState, useCallback } from 'react'
import { addDays, differenceInDays, format, startOfDay, parseISO, isValid } from 'date-fns'
import type { Task, Section, Project } from '@/types'

interface Props {
  project: Project
  tasks: Task[]
  sections: Section[]
  userId: string
  onTaskClick: (task: Task) => void
}

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-gray-400',
  doing: 'bg-blue-500',
  review: 'bg-amber-400',
  done: 'bg-teal-500',
  blocked: 'bg-red-500',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Todo', doing: 'Đang làm', review: 'Review', done: 'Xong', blocked: 'Blocked',
}

const MIN_COL_WIDTH = 28   // px per day
const MAX_COL_WIDTH = 80
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 56
const LABEL_WIDTH = 180

function toDay(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  return isValid(d) ? startOfDay(d) : null
}

export function TimelineView({ project, tasks, sections, onTaskClick }: Props) {
  const [colWidth, setColWidth] = useState(36)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ task: Task; x: number; y: number } | null>(null)

  const projectStart = toDay(project.created_at) ?? startOfDay(new Date())
  const projectEnd = toDay(project.deadline) ?? addDays(projectStart, 30)
  const totalDays = Math.max(differenceInDays(projectEnd, projectStart) + 7, 14)

  const days = Array.from({ length: totalDays }, (_, i) => addDays(projectStart, i))

  const zoom = useCallback((delta: number) => {
    setColWidth(w => Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, w + delta)))
  }, [])

  // group tasks: section rows + unsectioned
  const sectionRows = sections.map(s => ({
    section: s,
    tasks: tasks.filter(t => t.section_id === s.id),
  }))
  const unsectioned = tasks.filter(t => !t.section_id)

  const todayOffset = differenceInDays(startOfDay(new Date()), projectStart)
  const deadlineOffset = differenceInDays(projectEnd, projectStart)

  function dayX(d: Date) {
    return differenceInDays(d, projectStart) * colWidth
  }

  function renderBar(task: Task, rowY: number) {
    const deadline = toDay(task.deadline)
    const created = toDay(task.created_at)

    if (!deadline && !created) return null

    const start = created ?? projectStart
    const end = deadline ?? start

    const x = Math.max(0, dayX(start))
    const endX = dayX(end) + colWidth
    const width = Math.max(colWidth, endX - x)
    const isOverdue = deadline && differenceInDays(startOfDay(new Date()), deadline) > 0 && task.status !== 'done'

    return (
      <g
        key={task.id}
        style={{ cursor: 'pointer' }}
        onClick={() => onTaskClick(task)}
        onMouseEnter={e => {
          const rect = (e.currentTarget as SVGGElement).getBoundingClientRect()
          setTooltip({ task, x: rect.left, y: rect.top })
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        <rect
          x={x + 2}
          y={rowY + 6}
          width={Math.max(8, width - 4)}
          height={ROW_HEIGHT - 14}
          rx={4}
          className={`${STATUS_COLOR[task.status]} ${isOverdue ? 'opacity-100' : 'opacity-90'} hover:opacity-100 transition-opacity`}
          fill="currentColor"
        />
        {isOverdue && (
          <rect
            x={x + 2}
            y={rowY + 6}
            width={Math.max(8, width - 4)}
            height={ROW_HEIGHT - 14}
            rx={4}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.5}
          />
        )}
        {width > 40 && (
          <text
            x={x + 8}
            y={rowY + ROW_HEIGHT / 2 + 1}
            fontSize={11}
            fill="white"
            dominantBaseline="middle"
            className="select-none pointer-events-none"
          >
            {task.name.length > Math.floor(width / 7) ? task.name.slice(0, Math.floor(width / 7)) + '…' : task.name}
          </text>
        )}
        {/* deadline dot */}
        {deadline && (
          <circle
            cx={dayX(deadline) + colWidth / 2}
            cy={rowY + ROW_HEIGHT / 2}
            r={3}
            fill="white"
            opacity={0.8}
          />
        )}
      </g>
    )
  }

  let currentRowY = 0
  const svgHeight = (() => {
    let h = 0
    for (const { tasks: st } of sectionRows) {
      h += ROW_HEIGHT // section header
      h += st.length * ROW_HEIGHT
    }
    if (unsectioned.length > 0) {
      h += ROW_HEIGHT
      h += unsectioned.length * ROW_HEIGHT
    }
    return Math.max(h, ROW_HEIGHT * 3)
  })()

  const svgWidth = totalDays * colWidth

  // months grouping for header
  const months: { label: string; startDay: number; span: number }[] = []
  days.forEach((d, i) => {
    const label = format(d, 'MM/yyyy')
    if (months.length === 0 || months[months.length - 1].label !== label) {
      months.push({ label, startDay: i, span: 1 })
    } else {
      months[months.length - 1].span++
    }
  })

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0 bg-white">
        <span className="text-sm font-medium text-gray-700">Timeline</span>
        <div className="flex items-center gap-1 ml-auto">
          {/* legend */}
          {Object.entries(STATUS_LABEL).map(([s, label]) => (
            <span key={s} className="flex items-center gap-1 text-xs text-gray-500 mr-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_COLOR[s]}`} />
              {label}
            </span>
          ))}
          <div className="flex items-center border rounded overflow-hidden text-xs ml-2">
            <button onClick={() => zoom(-8)} className="px-2 py-1 hover:bg-gray-50 text-gray-600">−</button>
            <span className="px-2 py-1 text-gray-500 border-x">{colWidth}px/day</span>
            <button onClick={() => zoom(8)} className="px-2 py-1 hover:bg-gray-50 text-gray-600">+</button>
          </div>
        </div>
      </div>

      {/* Main layout: label column + scrollable chart */}
      <div className="flex flex-1 overflow-hidden">
        {/* Label column (sticky left) */}
        <div className="shrink-0 border-r bg-white z-10" style={{ width: LABEL_WIDTH }}>
          {/* Month + day header spacer */}
          <div style={{ height: HEADER_HEIGHT }} className="border-b" />
          {/* Section + task labels */}
          <div className="overflow-hidden" style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            {sectionRows.map(({ section, tasks: st }) => (
              <div key={section.id}>
                <div
                  className="flex items-center px-3 text-xs font-semibold text-gray-600 border-b"
                  style={{ height: ROW_HEIGHT, backgroundColor: section.color + '30' }}
                >
                  <span
                    className="w-2 h-2 rounded-full mr-2 shrink-0"
                    style={{ backgroundColor: section.color }}
                  />
                  <span className="truncate">{section.name}</span>
                  <span className="ml-auto text-gray-400">{st.length}</span>
                </div>
                {st.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center px-3 text-xs text-gray-600 border-b hover:bg-gray-50 cursor-pointer truncate"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onTaskClick(task)}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${STATUS_COLOR[task.status]}`} />
                    <span className="truncate">{task.name}</span>
                  </div>
                ))}
              </div>
            ))}
            {unsectioned.length > 0 && (
              <div>
                <div
                  className="flex items-center px-3 text-xs font-semibold text-gray-500 border-b bg-gray-50"
                  style={{ height: ROW_HEIGHT }}
                >
                  Không có section
                </div>
                {unsectioned.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center px-3 text-xs text-gray-600 border-b hover:bg-gray-50 cursor-pointer"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onTaskClick(task)}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${STATUS_COLOR[task.status]}`} />
                    <span className="truncate">{task.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable chart area */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <svg
            width={svgWidth}
            height={svgHeight + HEADER_HEIGHT}
            className="block"
            style={{ minWidth: svgWidth }}
          >
            {/* Month header */}
            {months.map(m => (
              <g key={m.label}>
                <rect
                  x={m.startDay * colWidth}
                  y={0}
                  width={m.span * colWidth}
                  height={24}
                  fill={m.startDay % 2 === 0 ? '#f9fafb' : '#f3f4f6'}
                />
                <text
                  x={m.startDay * colWidth + 6}
                  y={16}
                  fontSize={11}
                  fill="#6b7280"
                  className="select-none"
                >
                  {m.label}
                </text>
                <line
                  x1={m.startDay * colWidth}
                  y1={0}
                  x2={m.startDay * colWidth}
                  y2={svgHeight + HEADER_HEIGHT}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
              </g>
            ))}

            {/* Day header row */}
            {days.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              const isToday = i === todayOffset
              return (
                <g key={i}>
                  <rect
                    x={i * colWidth}
                    y={24}
                    width={colWidth}
                    height={32}
                    fill={isToday ? '#dbeafe' : isWeekend ? '#f3f4f6' : 'white'}
                  />
                  {colWidth >= 32 && (
                    <text
                      x={i * colWidth + colWidth / 2}
                      y={44}
                      fontSize={10}
                      textAnchor="middle"
                      fill={isToday ? '#2563eb' : isWeekend ? '#9ca3af' : '#6b7280'}
                      fontWeight={isToday ? 'bold' : 'normal'}
                      className="select-none"
                    >
                      {format(d, 'd')}
                    </text>
                  )}
                  {/* weekend shading extends into chart */}
                  {isWeekend && (
                    <rect
                      x={i * colWidth}
                      y={HEADER_HEIGHT}
                      width={colWidth}
                      height={svgHeight}
                      fill="#f9fafb"
                      opacity={0.6}
                    />
                  )}
                </g>
              )
            })}

            {/* Header bottom border */}
            <line x1={0} y1={HEADER_HEIGHT} x2={svgWidth} y2={HEADER_HEIGHT} stroke="#e5e7eb" strokeWidth={1} />

            {/* Today line */}
            {todayOffset >= 0 && todayOffset < totalDays && (
              <line
                x1={todayOffset * colWidth + colWidth / 2}
                y1={HEADER_HEIGHT}
                x2={todayOffset * colWidth + colWidth / 2}
                y2={svgHeight + HEADER_HEIGHT}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.7}
              />
            )}

            {/* Deadline line */}
            {deadlineOffset >= 0 && deadlineOffset < totalDays && (
              <line
                x1={deadlineOffset * colWidth + colWidth / 2}
                y1={HEADER_HEIGHT}
                x2={deadlineOffset * colWidth + colWidth / 2}
                y2={svgHeight + HEADER_HEIGHT}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.6}
              />
            )}

            {/* Task bars */}
            {(() => {
              currentRowY = HEADER_HEIGHT
              const elements: React.ReactNode[] = []

              for (const { section, tasks: st } of sectionRows) {
                // section row background
                elements.push(
                  <rect
                    key={`sec-${section.id}`}
                    x={0}
                    y={currentRowY}
                    width={svgWidth}
                    height={ROW_HEIGHT}
                    fill={section.color + '18'}
                  />
                )
                elements.push(
                  <line
                    key={`secl-${section.id}`}
                    x1={0} y1={currentRowY + ROW_HEIGHT}
                    x2={svgWidth} y2={currentRowY + ROW_HEIGHT}
                    stroke="#e5e7eb" strokeWidth={1}
                  />
                )
                currentRowY += ROW_HEIGHT

                for (const task of st) {
                  elements.push(
                    <rect
                      key={`bg-${task.id}`}
                      x={0}
                      y={currentRowY}
                      width={svgWidth}
                      height={ROW_HEIGHT}
                      fill="transparent"
                    />
                  )
                  elements.push(
                    <line
                      key={`tl-${task.id}`}
                      x1={0} y1={currentRowY + ROW_HEIGHT}
                      x2={svgWidth} y2={currentRowY + ROW_HEIGHT}
                      stroke="#f3f4f6" strokeWidth={1}
                    />
                  )
                  elements.push(renderBar(task, currentRowY))
                  currentRowY += ROW_HEIGHT
                }
              }

              if (unsectioned.length > 0) {
                elements.push(
                  <rect key="unsec-bg" x={0} y={currentRowY} width={svgWidth} height={ROW_HEIGHT} fill="#f9fafb" />
                )
                elements.push(
                  <line key="unsec-l" x1={0} y1={currentRowY + ROW_HEIGHT} x2={svgWidth} y2={currentRowY + ROW_HEIGHT} stroke="#e5e7eb" strokeWidth={1} />
                )
                currentRowY += ROW_HEIGHT

                for (const task of unsectioned) {
                  elements.push(
                    <line
                      key={`tl-${task.id}`}
                      x1={0} y1={currentRowY + ROW_HEIGHT}
                      x2={svgWidth} y2={currentRowY + ROW_HEIGHT}
                      stroke="#f3f4f6" strokeWidth={1}
                    />
                  )
                  elements.push(renderBar(task, currentRowY))
                  currentRowY += ROW_HEIGHT
                }
              }

              return elements
            })()}
          </svg>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-lg max-w-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <div className="font-medium mb-1">{tooltip.task.name}</div>
          <div className="text-gray-300 space-y-0.5">
            <div>Trạng thái: <span className="text-white">{STATUS_LABEL[tooltip.task.status]}</span></div>
            {tooltip.task.deadline && (
              <div>Deadline: <span className="text-white">{format(parseISO(tooltip.task.deadline), 'dd/MM/yyyy')}</span></div>
            )}
            {tooltip.task.assignee && (
              <div>Assignee: <span className="text-white">{tooltip.task.assignee.name}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
