'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'

const SECTION_COLORS = ['#EEEDFE','#FEF3C7','#D1FAE5','#FEE2E2','#DBEAFE','#F3E8FF','#ECFDF5','#FFF7ED']

interface Props {
  projectId: string
  currentCount: number
  onCreated: () => void
}

export function CreateSectionDialog({ projectId, currentCount, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const color = SECTION_COLORS[currentCount % SECTION_COLORS.length]
    const { error } = await supabase.from('sections').insert({
      project_id: projectId,
      name: name.trim(),
      color,
      ord: currentCount,
    })
    if (error) {
      toast.error('Lỗi', { description: error.message })
    } else {
      setName('')
      setOpen(false)
      onCreated()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">+ Thêm section</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo section mới</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Tên section" required />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Đang tạo...' : 'Tạo'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
