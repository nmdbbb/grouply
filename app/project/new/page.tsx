import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateProjectForm } from '@/components/project/CreateProjectForm'

export default async function NewProjectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3">
        <span className="font-bold text-lg">Grouply</span>
      </header>
      <main className="max-w-lg mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold mb-6">Tạo project mới</h1>
        <div className="bg-white rounded-xl border p-6">
          <CreateProjectForm userId={user.id} />
        </div>
      </main>
    </div>
  )
}
