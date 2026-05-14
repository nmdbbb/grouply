'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function RegisterForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) {
      toast.error('Lỗi đăng ký', { description: error.message })
    } else {
      toast.success('Đăng ký thành công', { description: 'Kiểm tra email để xác nhận tài khoản.' })
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="name">Tên</Label>
        <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Đang đăng ký...' : 'Đăng ký'}
      </Button>
    </form>
  )
}
