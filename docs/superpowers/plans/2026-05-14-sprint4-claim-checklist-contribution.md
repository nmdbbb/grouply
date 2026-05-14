# Sprint 4: Claim, Checklist, Contribution Bar, Task Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện toàn bộ Sprint 4: Claim task, Assign flow + AI suggest, Checklist Sidebar đầy đủ, Contribution Bar real-time, Task Drawer đầy đủ — full end-to-end flow.

**Architecture:** Tất cả components là client-side với Supabase client. Realtime subscription cho tasks và task_claims. Checklist sidebar tích hợp vào WorkspaceClient bên trái. Task Drawer là Sheet overlay từ phải. Contribution Bar là footer collapsible.

**Prerequisites:** Sprint 1 + 2 + 3 hoàn thành. Database schema, Auth, Graph, AI Chat đã có.

**Tech Stack:** Supabase Realtime, shadcn/ui Sheet, Zustand graphStore, date-fns

---

## File Map

```
components/
├── task/
│   ├── TaskDrawer.tsx           # Sheet overlay 400px từ phải
│   ├── ClaimBadge.tsx           # Badge claim trên TaskNode
│   └── ActivityLog.tsx          # Task history list
├── checklist/
│   └── ChecklistSidebar.tsx     # 240px sidebar trái, collapsible
└── contribution/
    └── ContributionBar.tsx      # Footer collapsible với contribution bars

components/graph/nodes/
└── TaskNode.tsx                 # Cập nhật: thêm ClaimBadge, onClick mở Drawer
```

---

### Task 1: Task Drawer — Phần cơ bản

**Files:**
- Create: `components/task/ActivityLog.tsx`
- Create: `components/task/TaskDrawer.tsx`

- [ ] **Step 1: ActivityLog component**

```typescript
// components/task/ActivityLog.tsx
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
            <span className="font-medium">{(h.profile as any)?.name ?? 'Ai đó'}</span>
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
```

- [ ] **Step 2: TaskDrawer component**

```typescript
// components/task/TaskDrawer.tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from './StatusBadge'
import { ActivityLog } from './ActivityLog'
import { formatDeadline, getInitials } from '@/lib/utils'
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
  }, [task?.id])

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
    setDocuments(d ?? [])
  }, [supabase])

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
    // Xóa claims sau khi assign
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

  if (!task) return null

  const assignee = members.find(m => m.id === task.assignee_id)
  const canEdit = currentUserRole === 'owner' || task.assignee_id === currentUserId

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-[400px] overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-white z-10">
          <SheetTitle className="text-base">{task.name}</SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {/* Status + Assignee + Deadline */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={status} onClick={canEdit ? handleCycleStatus : undefined} />
            <Select value={assigneeId} onValueChange={handleAssign} disabled={!canEdit}>
              <SelectTrigger className="w-36 h-7 text-xs">
                <SelectValue placeholder="Chưa assign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Chưa assign</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-36 h-7 text-xs"
              disabled={!canEdit}
            />
          </div>

          <Separator />

          {/* Tên + Mô tả */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tên task</Label>
              <Input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mô tả</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} disabled={!canEdit} />
            </div>
          </div>

          <Separator />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Loại task</Label>
              <Select value={type} onValueChange={v => setType(v as TaskType)} disabled={!canEdit}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Checklist item</Label>
              <Select value={checklistItemId} onValueChange={setChecklistItemId} disabled={!canEdit}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Không có" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Không có</SelectItem>
                  {checklistItems.map(ci => <SelectItem key={ci.id} value={ci.id}>{ci.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <Label htmlFor="optional" className="text-xs font-normal cursor-pointer">Có thể bỏ qua (optional)</Label>
          </div>

          <Separator />

          {/* Tài liệu */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Tài liệu</Label>
            {documents.map(d => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-blue-600 hover:underline truncate">
                {d.name || d.url}
              </a>
            ))}
            <div className="flex gap-2">
              <Input
                value={newDocUrl}
                onChange={e => setNewDocUrl(e.target.value)}
                placeholder="https://..."
                className="h-7 text-xs"
                onKeyDown={e => e.key === 'Enter' && addDocument()}
              />
              <Button size="sm" variant="outline" onClick={addDocument} className="h-7 text-xs">+</Button>
            </div>
          </div>

          <Separator />

          {/* Claims */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Đăng ký nhận task ({claims.length})</Label>
            {claims.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có ai đăng ký.</p>
            ) : (
              <div className="space-y-1.5">
                {claims.map(c => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={(c.profile as any)?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">{getInitials((c.profile as any)?.name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{(c.profile as any)?.name}</span>
                    </div>
                    {currentUserRole === 'owner' && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => handleAssign(c.user_id)}>
                        Assign
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {currentUserRole === 'owner' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Assign thủ công</Label>
                <Select value={assigneeId} onValueChange={handleAssign}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Chọn thành viên" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Bỏ assign</SelectItem>
                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Separator />

          {/* Activity */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Hoạt động</Label>
            <ActivityLog history={history} />
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex gap-2 pb-4">
            {canEdit && (
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            )}
            {onAskAI && (
              <Button variant="outline" onClick={() => onAskAI(task.id)} className="text-xs">
                💬 Hỏi AI
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/task/ActivityLog.tsx components/task/TaskDrawer.tsx
git commit -m "feat: add TaskDrawer with full edit, assign, claims, documents, activity"
```

---

### Task 2: ClaimBadge + Cập nhật TaskNode

**Files:**
- Create: `components/task/ClaimBadge.tsx`
- Modify: `components/graph/nodes/TaskNode.tsx`

- [ ] **Step 1: ClaimBadge component**

```typescript
// components/task/ClaimBadge.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface Claimer {
  id: string
  name: string
  avatar_url: string | null
}

interface Props {
  taskId: string
  currentUserId: string
  assigneeId: string | null
}

export function ClaimBadge({ taskId, currentUserId, assigneeId }: Props) {
  const [claimers, setClaimers] = useState<Claimer[]>([])
  const [hasClaimed, setHasClaimed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadClaims()
    const channel = supabase
      .channel(`claims-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_claims', filter: `task_id=eq.${taskId}` },
        () => loadClaims()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [taskId])

  async function loadClaims() {
    const { data } = await supabase
      .from('task_claims')
      .select('*, profile:profiles(id, name, avatar_url)')
      .eq('task_id', taskId)
    const list = (data ?? []).map(c => ({
      id: (c.profile as any)?.id,
      name: (c.profile as any)?.name ?? '',
      avatar_url: (c.profile as any)?.avatar_url ?? null,
    }))
    setClaimers(list)
    setHasClaimed(list.some(c => c.id === currentUserId))
  }

  async function handleClaim(e: React.MouseEvent) {
    e.stopPropagation()
    if (hasClaimed) {
      await supabase.from('task_claims').delete().eq('task_id', taskId).eq('user_id', currentUserId)
    } else {
      await supabase.from('task_claims').insert({ task_id: taskId, user_id: currentUserId })
    }
    loadClaims()
  }

  // Không hiện nếu đã assign
  if (assigneeId) return null

  const visible = claimers.slice(0, 3)
  const overflow = claimers.length - 3

  return (
    <div className="flex items-center gap-1 cursor-pointer" onClick={handleClaim} title={hasClaimed ? 'Rút claim' : 'Claim task này'}>
      {visible.map(c => (
        <Avatar key={c.id} className="h-4 w-4 border border-white">
          <AvatarImage src={c.avatar_url ?? undefined} />
          <AvatarFallback className="text-[8px]">{getInitials(c.name)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
      {claimers.length === 0 && (
        <span className="text-[10px] text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity">+ Claim</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật TaskNode để thêm ClaimBadge và onClick**

Mở `components/graph/nodes/TaskNode.tsx`. Thêm imports:

```typescript
import { ClaimBadge } from '@/components/task/ClaimBadge'
```

Cập nhật Props interface để nhận thêm `currentUserId` và `onOpenDrawer`:

```typescript
export interface TaskNodeData {
  task: Task
  members: { id: string; name: string; avatar_url: string | null }[]
  currentUserId: string
  onUpdated: () => void
  onOpenDrawer: (task: Task) => void
}
```

Thêm vào phần return của TaskNode, sau phần assignee/type row:

```typescript
<ClaimBadge
  taskId={task.id}
  currentUserId={data.currentUserId}
  assigneeId={task.assignee_id}
/>
```

Wrap toàn bộ card trong `onClick={() => data.onOpenDrawer(task)}` (trừ status badge và edge handles):

```typescript
// Thêm onClick vào div ngoài cùng (sau class group):
onClick={() => data.onOpenDrawer(task)}
// Thêm e.stopPropagation() vào StatusBadge onClick:
onClick={e => { e.stopPropagation(); cycleStatus() }}
```

- [ ] **Step 3: Cập nhật graphStore để nhận onOpenDrawer**

Mở `stores/graphStore.ts`. Cập nhật `TaskNodeData`:

```typescript
export interface TaskNodeData {
  task: Task
  members: { id: string; name: string; avatar_url: string | null }[]
  currentUserId: string
  onUpdated: () => void
  onOpenDrawer: (task: Task) => void
}
```

Cập nhật `buildFromData` để nhận thêm params:

```typescript
buildFromData: (
  tasks: Task[],
  sections: Section[],
  members: { id: string; name: string; avatar_url: string | null }[],
  currentUserId: string,
  onUpdated: () => void,
  onOpenDrawer: (task: Task) => void
) => {
  // ... cập nhật taskNodes data:
  data: { task: t, members, currentUserId, onUpdated, onOpenDrawer } as TaskNodeData,
}
```

- [ ] **Step 4: Cập nhật TaskGraph để truyền onOpenDrawer**

Mở `components/graph/TaskGraph.tsx`. Thêm prop `onOpenDrawer` và truyền vào `buildFromData`:

```typescript
interface Props {
  // ... existing props
  onOpenDrawer: (task: Task) => void
}

// Trong reload và useEffect:
buildFromData(tasksRef.current, sectionsRef.current, members, userId, reload, onOpenDrawer)
```

- [ ] **Step 5: Commit**

```bash
git add components/task/ClaimBadge.tsx components/graph/nodes/TaskNode.tsx stores/graphStore.ts components/graph/TaskGraph.tsx
git commit -m "feat: add ClaimBadge and TaskNode onClick to open Drawer"
```

---

### Task 3: Checklist Sidebar

**Files:**
- Create: `components/checklist/ChecklistSidebar.tsx`

- [ ] **Step 1: Viết ChecklistSidebar**

```typescript
// components/checklist/ChecklistSidebar.tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGraphStore } from '@/stores/graphStore'
import type { ChecklistItem, Task } from '@/types'

interface Props {
  projectId: string
  initialItems: ChecklistItem[]
  initialTasks: Task[]
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

export function ChecklistSidebar({ projectId, initialItems, initialTasks }: Props) {
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

  // Realtime: sync tasks để item status update real-time
  useEffect(() => {
    const channel = supabase
      .channel(`checklist-tasks-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        async () => {
          const { data } = await supabase.from('tasks').select('*').eq('project_id', projectId)
          if (data) setTasks(data as Task[])
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `project_id=eq.${projectId}` },
        async () => {
          const { data } = await supabase.from('checklist_items').select('*').eq('project_id', projectId).order('ord')
          if (data) setItems(data as ChecklistItem[])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, supabase])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(`checklist-collapsed-${projectId}`, String(next))
  }

  function handleClickItem(itemId: string) {
    if (highlightedItemId === itemId) {
      setHighlightedItemId(null)
      // Reset opacity
      setNodes(nodes.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })))
      return
    }
    setHighlightedItemId(itemId)
    const linkedTaskIds = new Set(tasks.filter(t => t.checklist_item_id === itemId).map(t => t.id))
    setNodes(nodes.map(n => ({
      ...n,
      style: { ...n.style, opacity: linkedTaskIds.has(n.id) || n.type === 'sectionNode' ? 1 : 0.2 },
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
      <div className="w-8 border-r bg-white flex flex-col items-center py-3">
        <button onClick={toggleCollapsed} className="text-muted-foreground hover:text-foreground text-xs" title="Mở checklist">
          →
        </button>
      </div>
    )
  }

  return (
    <div className="w-60 border-r bg-white flex flex-col h-full shrink-0">
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
                <div className="flex items-center gap-1 mt-0.5">
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

        {/* Add item */}
        {addingItem ? (
          <div className="flex gap-1 mt-1">
            <Input
              autoFocus
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAddingItem(false) }}
              placeholder="Tên deliverable..."
              className="h-7 text-xs"
            />
            <Button size="sm" onClick={addItem} className="h-7 px-2 text-xs">+</Button>
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
        <Progress value={progressPct} className="h-1.5" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/checklist/ChecklistSidebar.tsx
git commit -m "feat: add ChecklistSidebar with real-time status and graph highlight"
```

---

### Task 4: Contribution Bar

**Files:**
- Create: `components/contribution/ContributionBar.tsx`

- [ ] **Step 1: Viết ContributionBar**

```typescript
// components/contribution/ContributionBar.tsx
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface Member {
  id: string
  name: string
  avatar_url: string | null
}

interface Props {
  projectId: string
  members: Member[]
}

interface MemberContrib {
  member: Member
  doneTasks: number
  doingTasks: number
  pct: number
}

export function ContributionBar({ projectId, members }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [contribs, setContribs] = useState<MemberContrib[]>([])
  const supabase = createClient()

  async function loadContributions() {
    const { data: doneTasks } = await supabase
      .from('tasks')
      .select('assignee_id')
      .eq('project_id', projectId)
      .eq('status', 'done')
      .not('assignee_id', 'is', null)

    const { data: doingTasks } = await supabase
      .from('tasks')
      .select('assignee_id')
      .eq('project_id', projectId)
      .in('status', ['doing', 'review'])
      .not('assignee_id', 'is', null)

    const totalDone = doneTasks?.length ?? 0

    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name))
    const result: MemberContrib[] = sorted.map(m => {
      const done = (doneTasks ?? []).filter(t => t.assignee_id === m.id).length
      const doing = (doingTasks ?? []).filter(t => t.assignee_id === m.id).length
      return {
        member: m,
        doneTasks: done,
        doingTasks: doing,
        pct: totalDone > 0 ? Math.round((done / totalDone) * 100) : 0,
      }
    })

    setContribs(result)
  }

  useEffect(() => {
    loadContributions()
    const channel = supabase
      .channel(`contribution-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        () => loadContributions()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, members])

  if (collapsed) {
    return (
      <div className="border-t bg-white px-4 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground font-medium">Contribution</span>
        <button onClick={() => setCollapsed(false)} className="text-xs text-muted-foreground hover:text-foreground">▲</button>
      </div>
    )
  }

  return (
    <div className="border-t bg-white px-4 py-3 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Contribution</span>
        <button onClick={() => setCollapsed(true)} className="text-xs text-muted-foreground hover:text-foreground">▼</button>
      </div>
      <div className="flex items-center gap-4 overflow-x-auto">
        {contribs.map(c => (
          <div key={c.member.id} className="flex items-center gap-2 shrink-0 group relative">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarFallback className="text-[10px]">{getInitials(c.member.name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">{c.member.name}</span>
              <div className="flex items-center gap-1">
                <div className="h-2 bg-teal-500 rounded-sm" style={{ width: `${Math.max(c.pct, 2)}px`, minWidth: '2px', maxWidth: '80px' }} />
                <span className="text-[10px] text-muted-foreground">{c.pct}%</span>
              </div>
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-0 mb-1 bg-gray-800 text-white text-[10px] rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
              {c.doneTasks} done · {c.doingTasks} doing
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/contribution/ContributionBar.tsx
git commit -m "feat: add ContributionBar with real-time update"
```

---

### Task 5: Tích hợp tất cả vào WorkspaceClient

**Files:**
- Modify: `components/WorkspaceClient.tsx`
- Modify: `app/project/[id]/page.tsx`

- [ ] **Step 1: Cập nhật WorkspaceClient — thêm ChecklistSidebar, ContributionBar, TaskDrawer**

Mở `components/WorkspaceClient.tsx`. Thêm imports:

```typescript
import { ChecklistSidebar } from '@/components/checklist/ChecklistSidebar'
import { ContributionBar } from '@/components/contribution/ContributionBar'
import { TaskDrawer } from '@/components/task/TaskDrawer'
import type { ChecklistItem } from '@/types'
```

Thêm vào Props:

```typescript
initialChecklistItems: ChecklistItem[]
```

Thêm state cho drawer:

```typescript
const [drawerTask, setDrawerTask] = useState<Task | null>(null)
const [drawerOpen, setDrawerOpen] = useState(false)

function handleOpenDrawer(task: Task) {
  setDrawerTask(task)
  setDrawerOpen(true)
}
```

Cập nhật layout tổng thể — thay đổi main section:

```typescript
<main className="flex-1 overflow-hidden flex flex-col">
  {/* Content row: Checklist + Graph/List + Chat */}
  <div className="flex flex-1 overflow-hidden">
    {/* Checklist sidebar trái */}
    <ChecklistSidebar
      projectId={project.id}
      initialItems={initialChecklistItems}
      initialTasks={initialTasks}
    />

    {/* Graph hoặc List chiếm giữa */}
    {view === 'graph' ? (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <TaskGraph
            projectId={project.id}
            userId={userId}
            initialTasks={initialTasks}
            initialSections={initialSections}
            members={members}
            onToggleView={() => setView('list')}
            currentView="graph"
            onOpenDrawer={handleOpenDrawer}
          />
        </div>
        <div className="w-80 shrink-0">
          <ChatPanel
            projectId={project.id}
            context={aiContext}
            currentUserName={currentUserName}
            currentUserRole={userRole}
          />
        </div>
      </div>
    ) : (
      <div className="flex-1 overflow-auto">
        <div className="flex justify-between items-center px-6 py-3 border-b bg-white">
          <h2 className="font-medium">List View</h2>
          <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setView('graph')}>
            → Graph view
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-6">
          <TaskList projectId={project.id} userId={userId} initialSections={initialSections} initialTasks={initialTasks} />
        </div>
      </div>
    )}
  </div>

  {/* Contribution Bar footer */}
  <ContributionBar projectId={project.id} members={members} />
</main>
```

Thêm TaskDrawer ở cuối (trước closing div):

```typescript
<TaskDrawer
  task={drawerTask}
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  sections={initialSections}
  checklistItems={initialChecklistItems}
  members={members.map(m => ({ ...m, role: 'member' }))}
  currentUserId={userId}
  currentUserRole={userRole}
  projectId={project.id}
  onUpdated={() => {}}
  onAskAI={(taskId) => {
    // TODO Sprint 3 integration: open chat với selected_task_id
    setDrawerOpen(false)
  }}
/>
```

- [ ] **Step 2: Cập nhật WorkspacePage để fetch checklist items**

Mở `app/project/[id]/page.tsx`. Thêm vào Promise.all:

```typescript
supabase.from('checklist_items').select('*').eq('project_id', params.id).order('ord'),
```

Destructure thêm `{ data: checklistItems }` và truyền vào WorkspaceClient:

```typescript
initialChecklistItems={(checklistItems ?? []) as ChecklistItem[]}
```

- [ ] **Step 3: Cập nhật TaskGraph để nhận onOpenDrawer**

Mở `components/graph/TaskGraph.tsx`. Thêm `onOpenDrawer` vào Props và truyền vào `buildFromData`:

```typescript
interface Props {
  // ... existing
  onOpenDrawer: (task: Task) => void
}
// Cập nhật buildFromData call:
buildFromData(tasksRef.current, sectionsRef.current, members, userId, reload, onOpenDrawer)
```

- [ ] **Step 4: Commit**

```bash
git add components/WorkspaceClient.tsx app/project/[id]/page.tsx components/graph/TaskGraph.tsx
git commit -m "feat: integrate ChecklistSidebar, ContributionBar, TaskDrawer into workspace"
```

---

### Task 6: Sprint 4 Verification — Full End-to-End

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: không có lỗi.

- [ ] **Step 2: Full smoke test**

Dùng 2 tài khoản: **Owner** và **Member**.

**Checklist Sidebar:**
```
1. Workspace hiện checklist sidebar bên trái 240px ✓
2. "+ Add item" → nhập tên → Enter → item xuất hiện với icon □ ✓
3. Khi task linked đang doing → icon đổi thành ◑ ✓
4. Khi tất cả task linked done → icon đổi thành ■ ✓
5. Item không có task → ⚠ icon amber ✓
6. Click item → graph: task linked sáng, các node khác mờ 0.2 ✓
7. Click lại item → reset opacity ✓
8. Collapse button → sidebar thu nhỏ còn 32px ✓
9. Reload → sidebar state restore từ localStorage ✓
10. Progress bar bottom hiện X/N ✓
```

**Task Drawer:**
```
1. Click TaskNode → Drawer mở từ phải 400px ✓
2. ESC → Drawer đóng ✓
3. Click ngoài drawer → Drawer đóng ✓
4. Owner: sửa tên, mô tả, deadline → Lưu → thay đổi persist ✓
5. Owner: assign từ dropdown → task_claims bị xóa ✓
6. Member không phải assignee: fields bị disabled ✓
7. Thêm link tài liệu → xuất hiện trong list ✓
8. Activity log hiện lịch sử thao tác ✓
```

**Claim Flow:**
```
1. TaskNode chưa assign → hover → "+ Claim" badge xuất hiện ✓
2. Member click Claim → avatar xuất hiện trên node ✓
3. Tab Owner thấy claim badge update real-time ✓
4. Owner mở drawer → thấy claimer trong list → click Assign ✓
5. Sau assign: claim badge biến mất, assignee avatar xuất hiện ✓
```

**Contribution Bar:**
```
1. Footer hiện contribution bars alphabetical theo tên ✓
2. Hover bar → tooltip "X done · Y doing" ✓
3. Mark task done → bar update real-time ✓
4. Collapse button → bar thu thành 1 line ✓
```

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: sprint 4 complete — full MVP end-to-end"
```

---

### Task 7: MVP Final Checklist

- [ ] **Kiểm tra toàn bộ user flow từ đầu đến cuối:**

```
□ Đăng ký → Đăng nhập → Dashboard
□ Tạo project với brief → workspace tự động parse brief
□ Graph hiện section + task nodes
□ Kéo thả node → position lưu → reload vẫn đúng vị trí
□ 2 tab mở cùng lúc → thay đổi sync < 1 giây
□ AI Chat API mode: hỏi + tool call + Commit → graph update
□ AI Chat Simulate mode: export prompt → paste response → Commit
□ Claim task → Assign từ drawer
□ Checklist sidebar + graph highlight
□ Contribution bar real-time
□ Invite member → join → thấy cùng project
□ Settings: đổi tên, BYOK key
```

- [ ] **Final commit nếu cần fix gì:**

```bash
git add .
git commit -m "fix: MVP final adjustments"
```
