import Link from 'next/link'
import { RegisterForm } from '@/components/auth/RegisterForm'

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 bg-white p-8 rounded-xl shadow-sm border">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Grouply</h1>
          <p className="text-muted-foreground text-sm mt-1">Tạo tài khoản mới</p>
        </div>
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link href="/login" className="underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  )
}
