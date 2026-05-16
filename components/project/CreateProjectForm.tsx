'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const schema = z.object({
  name: z.string().min(1, 'Tên bài tập không được để trống'),
  subject: z.string().optional(),
  deadline: z.string().min(1, 'Deadline không được để trống'),
  brief: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function CreateProjectForm({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          subject: data.subject || null,
          deadline: data.deadline,
          brief: data.brief || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      if (data.brief?.trim()) {
        localStorage.setItem(`grouply-brief-${json.projectId}`, data.brief.trim())
      }
      router.push(`/project/${json.projectId}?parseBrief=1`)
      router.refresh()
    } catch (err: any) {
      toast.error('Lỗi', { description: err.message })
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Tên bài tập *</Label>
        <Input id="name" {...register('name')} placeholder="VD: Phân tích thị trường" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="subject">Môn học</Label>
        <Input id="subject" {...register('subject')} placeholder="VD: MKTA302" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="deadline">Deadline *</Label>
        <Input id="deadline" type="date" {...register('deadline')} />
        {errors.deadline && <p className="text-xs text-destructive">{errors.deadline.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="brief">Đề bài (tùy chọn)</Label>
        <Textarea
          id="brief"
          {...register('brief')}
          placeholder="Paste nội dung đề bài hoặc link..."
          rows={4}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Đang tạo...' : 'Tạo project →'}
      </Button>
    </form>
  )
}
