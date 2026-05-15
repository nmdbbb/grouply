'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGraphStore } from '@/stores/graphStore'
import type { ChecklistItem, Task } from '@/types'

interface Props {
  projectId: string
  initialItems: ChecklistItem[]
  initialTasks: Task[]
  onCollapsedChange?: (collapsed: boolean) => void
}

function getItemStatus(item: ChecklistItem, tasks: Task[]): 'pending' | 'in_progress' | 'done' {
  const linked = tasks.filter(t => t.checklist_item_id === item.id)
  if (linked.length === 0) return 'pending'
  if (linked.every(t => t.status === 'done')) return 'done'
  if (linked.some(t => t.status === 'doing' || t.status === 'review')) return 'in_progress'
  return 'pending'
}

const STATUS_ICON = { pending: '□', in_progress: '◑', done: '■' }
const STATUS_COLOR = { pending: 'text-gray-500', in_progress: 'text-blue-500', done: 'text-teal-600' }

export function ChecklistSidebar({ projectId, initialItems, initialTasks, onCollapsedChange }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`checklist-collapsed-${projectId}`) === 'true'
    }
    return false
  })
  const [items, setItems] = useState(initialItems)
  const [tasks, setTasks] = useState(initialTasks)
  const [newItemName, setNewItemName] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const { nodes, setNodes } = useGraphStore()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`checklist-tasks-${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `project_id=eq.${projectId}`,
      }, async () => {
        const { data } = await supabase.from('tasks').select('*').eq('project_id', projectId)
        if (data) setTasks(data as Task[])
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checklist_items',
        filter: `project_id=eq.${projectId}`,
      }, async () => {
        const { data } = await supabase.from('checklist_items').select('*').eq('project_id', projectId).order('ord')
        if (data) setItems(data as ChecklistItem[])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(`checklist-collapsed-${projectId}`, String(next))
    onCollapsedChange?.(next)
  }

  function handleClickItem(itemId: string) {
    if (highlightedItemId === itemId) {
      setHighlightedItemId(null)
      setNodes(nodes.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })))
      return
    }
    setHighlightedItemId(itemId)
    const linkedTaskIds = new Set(tasks.filter(t => t.checklist_item_id === itemId).map(t => t.id))
    setNodes(nodes.map(n => ({
      ...n,
      style: {
        ...n.style,
        opacity: (linkedTaskIds.has(n.id) || n.type === 'sectionNode') ? 1 : 0.2,
      },
    })))
  }

  async function addItem() {
    if (!newItemName.trim()) return
    await supabase.from('checklist_items').insert({
      project_id: projectId,
      name: newItemName.trim(),
      ord: items.length,
    })
    setNewItemName('')
    setAddingItem(false)
  }

  const doneCount = items.filter(item => getItemStatus(item, tasks) === 'done').length
  const progressPct = items.length > 0 ? (doneCount / items.length) * 100 : 0

  if (collapsed) {
    return (
      <div className="w-full h-full border-r bg-white flex flex-col items-center py-3">
        <button
          onClick={toggleCollapsed}
          className="text-muted-foreground hover:text-foreground text-xs"
          title="Mở checklist"
        >
          →
        </button>
      </div>
    )
  }

  return (
    <div className="w-full border-r bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
        <span className="text-sm font-semibold">Checklist</span>
        <button onClick={toggleCollapsed} className="text-muted-foreground hover:text-foreground text-xs">←</button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {items.map(item => {
          const status = getItemStatus(item, tasks)
          const linkedCount = tasks.filter(t => t.checklist_item_id === item.id).length
          const isHighlighted = highlightedItemId === item.id

          return (
            <div
              key={item.id}
              onClick={() => handleClickItem(item.id)}
              className={`flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                isHighlighted ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-gray-50'
              }`}
            >
              <span className={`text-base mt-0.5 shrink-0 ${STATUS_COLOR[status]}`}>
                {STATUS_ICON[status]}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs leading-tight ${status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                  {item.name}
                </p>
                <div className="mt-0.5">
                  {linkedCount === 0 ? (
                    <span className="text-[10px] text-amber-500">⚠ Chưa có task</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{linkedCount} task</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {addingItem ? (
          <div className="flex gap-1 mt-1">
            <input
              autoFocus
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addItem()
                if (e.key === 'Escape') setAddingItem(false)
              }}
              placeholder="Tên deliverable..."
              className="flex-1 border rounded px-2 py-1 text-xs h-7"
            />
            <button onClick={addItem} className="border rounded px-2 py-1 text-xs h-7 hover:bg-gray-50">+</button>
          </div>
        ) : (
          <button
            onClick={() => setAddingItem(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1"
          >
            + Add item
          </button>
        )}
      </div>

      {/* Progress footer */}
      <div className="px-3 py-2.5 border-t shrink-0">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Tiến độ</span>
          <span>{doneCount}/{items.length}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
