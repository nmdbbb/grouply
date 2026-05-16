'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActivityLog } from './ActivityLog'
import { StatusBadge } from './StatusBadge'
import { formatDeadline, getInitials } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Task, Section, ChecklistItem, TaskHistory, TaskClaim, TaskDocument } from '@/types'
import type { TaskStatus, TaskType } from '@/types'

const STATUS_CYCLE: TaskStatus[] = ['todo', 'doing', 'review', 'done']
const TASK_TYPES: TaskType[] = ['output', 'coordination', 'research', 'review']

interface Member {
  id: string
  name: string
  avatar_url: string | null
  role: string
}

interface Props {
  task: Task | null
  open: boolean
  onClose: () => void
  sections: Section[]
  checklistItems: ChecklistItem[]
  members: Member[]
  currentUserId: string
  currentUserRole: string
  projectId: string
  onUpdated: () => void
  onAskAI?: (taskId: string) => void
}

export function TaskDrawer({
  task, open, onClose, sections, checklistItems, members,
  currentUserId, currentUserRole, projectId, onUpdated, onAskAI,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [type, setType] = useState<TaskType>('output')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [checklistItemId, setChecklistItemId] = useState<string>('')
  const [isOptional, setIsOptional] = useState(false)
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [claims, setClaims] = useState<TaskClaim[]>([])
  const [documents, setDocuments] = useState<TaskDocument[]>([])
  const [newDocUrl, setNewDocUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const loadTaskDetails = useCallback(async (taskId: string) => {
    const [{ data: h }, { data: c }, { data: d }] = await Promise.all([
      supabase.from('task_history')
        .select('*, profile:profiles(name)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('task_claims')
        .select('*, profile:profiles(id, name, avatar_url)')
        .eq('task_id', taskId)
        .order('created_at'),
      supabase.from('task_documents')
        .select('*')
        .eq('task_id', taskId),
    ])
    setHistory((h ?? []) as TaskHistory[])
    setClaims((c ?? []) as TaskClaim[])
    setDocuments((d ?? []) as TaskDocument[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!task) return
    setName(task.name)
    setDescription(task.description ?? '')
    setDeadline(task.deadline ?? '')
    setType(task.type as TaskType)
    setStatus(task.status as TaskStatus)
    setAssigneeId(task.assignee_id ?? '')
    setChecklistItemId(task.checklist_item_id ?? '')
    setIsOptional(task.is_optional)
    loadTaskDetails(task.id)
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!task) return
    setSaving(true)
    await supabase.from('tasks').update({
      name,
      description: description || null,
      deadline: deadline || null,
      type,
      status,
      assignee_id: assigneeId || null,
      checklist_item_id: checklistItemId || null,
      is_optional: isOptional,
    }).eq('id', task.id)

    await supabase.from('task_history').insert({
      task_id: task.id,
      user_id: currentUserId,
      action: 'updated',
      new_value: { name, status, assignee_id: assigneeId || null },
    })

    setSaving(false)
    onUpdated()
  }

  async function handleCycleStatus() {
    if (!task) return
    const idx = STATUS_CYCLE.indexOf(status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setStatus(next)
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    await supabase.from('task_history').insert({
      task_id: task.id, user_id: currentUserId,
      action: 'status_changed',
      old_value: { status }, new_value: { status: next },
    })
    onUpdated()
  }

  async function handleAssign(memberId: string) {
    if (!task) return
    setAssigneeId(memberId)
    await supabase.from('tasks').update({ assignee_id: memberId || null }).eq('id', task.id)
    if (memberId) await supabase.from('task_claims').delete().eq('task_id', task.id)
    await supabase.from('task_history').insert({
      task_id: task.id, user_id: currentUserId,
      action: 'assigned', new_value: { assignee_id: memberId },
    })
    onUpdated()
    loadTaskDetails(task.id)
  }

  async function addDocument() {
    if (!task || !newDocUrl.trim()) return
    await supabase.from('task_documents').insert({
      task_id: task.id, url: newDocUrl.trim(), created_by: currentUserId,
    })
    setNewDocUrl('')
    loadTaskDetails(task.id)
  }

  if (!open || !task) return null

  const canEdit = currentUserRole === 'owner' || task.assignee_id === currentUserId

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onKeyDown={e => e.key === 'Escape' && onClose()}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-white border-l shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold truncate pr-4">{task.name}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status + Deadline */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={status} onClick={canEdit ? handleCycleStatus : undefined} />
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="border rounded px-2 py-1 text-xs h-7"
              disabled={!canEdit}
            />
          </div>

          <hr />

          {/* Assignee */}
          <div className="space-y-1">
            <label className="text-xs font-semibold">Assignee</label>
            <select
              value={assigneeId}
              onChange={e => handleAssign(e.target.value)}
              disabled={!canEdit}
              className="w-full border rounded px-2 py-1.5 text-xs"
            >
              <option value="">Chưa assign</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <hr />

          {/* Tên + Mô tả */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Tên task</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!canEdit}
                className="w-full border rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Mô tả</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                disabled={!canEdit}
                className="w-full border rounded px-3 py-1.5 text-sm resize-none"
              />
            </div>
          </div>

          <hr />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Loại task</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as TaskType)}
                disabled={!canEdit}
                className="w-full border rounded px-2 py-1.5 text-xs"
              >
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Checklist item</label>
              <select
                value={checklistItemId}
                onChange={e => setChecklistItemId(e.target.value)}
                disabled={!canEdit}
                className="w-full border rounded px-2 py-1.5 text-xs"
              >
                <option value="">Không có</option>
                {checklistItems.map(ci => (
                  <option key={ci.id} value={ci.id}>{ci.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="optional"
              checked={isOptional}
              onChange={e => setIsOptional(e.target.checked)}
              disabled={!canEdit}
            />
            <label htmlFor="optional" className="text-xs font-normal cursor-pointer">
              Có thể bỏ qua (optional)
            </label>
          </div>

          <hr />

          {/* Tài liệu */}
          <div className="space-y-2">
            <label className="text-xs font-semibold">Tài liệu</label>
            {documents.map(d => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-blue-600 hover:underline truncate">
                {d.name || d.url}
              </a>
            ))}
            <div className="flex gap-2">
              <input
                value={newDocUrl}
                onChange={e => setNewDocUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 border rounded px-2 py-1 text-xs h-7"
                onKeyDown={e => e.key === 'Enter' && addDocument()}
              />
              <button
                onClick={addDocument}
                className="border rounded px-3 py-1 text-xs h-7 hover:bg-gray-50"
              >
                +
              </button>
            </div>
          </div>

          <hr />

          {/* Claims */}
          <div className="space-y-2">
            <label className="text-xs font-semibold">Đăng ký nhận task ({claims.length})</label>
            {claims.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có ai đăng ký.</p>
            ) : (
              <div className="space-y-1.5">
                {claims.map(c => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={(c as any).profile?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {getInitials((c as any).profile?.name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{(c as any).profile?.name}</span>
                    </div>
                    {currentUserRole === 'owner' && (
                      <button
                        className="text-xs border rounded px-2 py-0.5 hover:bg-gray-50"
                        onClick={() => handleAssign(c.user_id)}
                      >
                        Assign
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr />

          {/* Activity */}
          <div className="space-y-2">
            <label className="text-xs font-semibold">Hoạt động</label>
            <ActivityLog history={history} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t shrink-0 flex gap-2">
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-gray-900 text-white text-sm rounded-lg py-2 hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          )}
          {onAskAI && (
            <button
              onClick={() => onAskAI(task.id)}
              className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50"
            >
              💬 Hỏi AI
            </button>
          )}
        </div>
      </div>
    </>
  )
}
