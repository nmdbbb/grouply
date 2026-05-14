'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: data.name,
          subject: data.subject || null,
          deadline: data.deadline,
          owner_id: userId,
          description: data.brief || null,
        })
        .select()
        .single()

      if (projectError) throw projectError

      await supabase.from('sections').insert({
        project_id: project.id,
        name: 'Chung',
        color: '#EEEDFE',
        ord: 0,
      })

      await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: userId,
        role: 'owner',
      })

      router.push(`/project/${project.id}`)
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
