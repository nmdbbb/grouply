'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [byokKey, setByokKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('name, byok_key').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setName(data.name)
            if (data.byok_key) setByokKey('••••••••')
          }
        })
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setLoading(true)
    const updates: Record<string, string> = { name }
    if (byokKey && byokKey !== '••••••••') {
      updates.byok_key = byokKey
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (error) {
      toast.error('Lỗi', { description: error.message })
    } else {
      toast.success('Đã lưu')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3">
        <span className="font-bold text-lg">Grouply — Settings</span>
      </header>
      <main className="max-w-lg mx-auto px-6 py-10">
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold">Thông tin cá nhân</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1">
              <Label>Tên hiển thị</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Anthropic API Key (BYOK)</Label>
              <Input
                type="password"
                value={byokKey}
                onChange={e => setByokKey(e.target.value)}
                placeholder="sk-ant-..."
              />
              <p className="text-xs text-muted-foreground">
                Nếu để trống, app dùng API key mặc định. Key được lưu an toàn.
              </p>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
