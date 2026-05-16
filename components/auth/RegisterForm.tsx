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
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (signUpError) {
      toast.error('Lỗi đăng ký', { description: signUpError.message })
      setLoading(false)
      return
    }
    // Tự đăng nhập luôn, không cần confirm email
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      toast.success('Đăng ký thành công! Hãy đăng nhập.')
      router.push('/login')
    } else {
      router.push('/dashboard')
      router.refresh()
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
