import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 bg-white p-8 rounded-xl shadow-sm border">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Grouply</h1>
          <p className="text-muted-foreground text-sm mt-1">Đăng nhập để tiếp tục</p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="underline">Đăng ký</Link>
        </p>
      </div>
    </div>
  )
}
