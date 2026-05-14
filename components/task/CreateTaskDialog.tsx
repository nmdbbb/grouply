'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Section } from '@/types'

interface Props {
  projectId: string
  sections: Section[]
  userId: string
  onCreated: () => void
}

export function CreateTaskDialog({ projectId, sections, userId, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '')
  const [type, setType] = useState('output')
  const [deadline, setDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const { error } = await supabase.from('tasks').insert({
      project_id: projectId,
      section_id: sectionId || null,
      name: name.trim(),
      type,
      deadline: deadline || null,
      created_by: userId,
    })
    if (error) {
      toast.error('Lỗi', { description: error.message })
    } else {
      setName('')
      setDeadline('')
      setOpen(false)
      onCreated()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ Thêm task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo task mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label>Tên task *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger><SelectValue placeholder="Chọn section" /></SelectTrigger>
              <SelectContent>
                {sections.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Loại</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="output">Output</SelectItem>
                <SelectItem value="coordination">Coordination</SelectItem>
                <SelectItem value="research">Research</SelectItem>
                <SelectItem value="review">Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Deadline</Label>
            <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Đang tạo...' : 'Tạo task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
