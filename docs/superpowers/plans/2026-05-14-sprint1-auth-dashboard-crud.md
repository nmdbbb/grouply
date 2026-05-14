# Sprint 1: Auth + Dashboard + Task CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap Next.js project với Supabase Auth, Dashboard page, tạo project, quản lý sections/tasks (CRUD), invite members, list view — đủ để nhóm bắt đầu dùng mà không cần graph hay AI.

**Architecture:** Next.js 14 App Router, Supabase hosted (PostgreSQL + Auth + Realtime), server components cho data fetching, client components cho interactions. RLS bảo vệ tất cả data. Middleware redirect auth.

**Tech Stack:** Next.js 14, TypeScript strict, Tailwind CSS, shadcn/ui, Supabase JS v2, react-hook-form, zod, date-fns

---

## File Map

```
grouply/
├── app/
│   ├── layout.tsx                        # root layout, font, Toaster
│   ├── page.tsx                          # redirect logic
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/page.tsx
│   ├── project/
│   │   ├── new/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx                  # workspace shell (Sprint 1: list view only)
│   │       └── list/page.tsx
│   ├── settings/page.tsx
│   └── invite/[token]/page.tsx
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── dashboard/
│   │   └── ProjectCard.tsx
│   ├── project/
│   │   ├── CreateProjectForm.tsx
│   │   ├── InviteButton.tsx
│   │   └── MemberAvatarStack.tsx
│   ├── task/
│   │   ├── TaskList.tsx                  # list view của tasks
│   │   ├── TaskRow.tsx                   # một row trong list
│   │   ├── CreateTaskDialog.tsx
│   │   └── StatusBadge.tsx
│   ├── section/
│   │   ├── SectionAccordion.tsx
│   │   └── CreateSectionDialog.tsx
│   └── ui/                              # shadcn components (button, input, dialog, etc.)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                    # createBrowserClient
│   │   └── server.ts                    # createServerClient (cookies)
│   └── utils.ts                         # cn(), formatDeadline()
├── middleware.ts                         # auth guard
├── types/index.ts                        # Task, Project, Member, Section, ChecklistItem types
└── supabase/
    └── migrations/
        └── 001_init.sql                 # full schema + RLS + Realtime
```

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`
- Create: `.env.local.example`

- [ ] **Step 1: Khởi tạo Next.js project**

```bash
cd c:\Users\Admin\Uni\grouply
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
```

Chọn: Yes TypeScript, Yes Tailwind, Yes ESLint, Yes App Router, No src/, `@/*`

- [ ] **Step 2: Cài dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install react-hook-form zod @hookform/resolvers
npm install date-fns
npm install zustand
npm install @xyflow/react
npm install @anthropic-ai/sdk
npm install dagre
npm install @types/dagre -D
npm install mammoth pdfjs-dist
```

- [ ] **Step 3: Cài shadcn/ui**

```bash
npx shadcn@latest init
```

Chọn: Default style, Default base color, Yes CSS variables.

```bash
npx shadcn@latest add button input label card badge avatar dialog sheet dropdown-menu textarea select toast separator progress skeleton tabs
```

- [ ] **Step 4: Tạo `.env.local`**

```bash
cp .env.local.example .env.local
```

Nội dung `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
ENCRYPTION_SECRET=a_random_32char_string
```

Điền giá trị thật vào `.env.local` từ Supabase Dashboard > Settings > API.

- [ ] **Step 5: Commit**

```bash
git init
git add .
git commit -m "feat: bootstrap Next.js project with dependencies"
```

---

### Task 2: Types

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Viết types**

```typescript
// types/index.ts
export type UserRole = 'owner' | 'member'
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'blocked'
export type TaskType = 'output' | 'coordination' | 'research' | 'review'
export type HistoryAction = 'status_changed' | 'assigned' | 'created' | 'updated' | 'deleted'

export interface Profile {
  id: string
  name: string
  avatar_url: string | null
  byok_key: string | null
  created_at: string
}

export interface Project {
  id: string
  name: string
  subject: string | null
  description: string | null
  deadline: string
  owner_id: string
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  joined_at: string
  profile?: Profile
}

export interface Section {
  id: string
  project_id: string
  name: string
  color: string
  ord: number
  created_at: string
}

export interface ChecklistItem {
  id: string
  project_id: string
  name: string
  description: string | null
  ord: number
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  section_id: string | null
  checklist_item_id: string | null
  name: string
  description: string | null
  assignee_id: string | null
  status: TaskStatus
  type: TaskType
  deadline: string | null
  blocked_by_id: string | null
  is_optional: boolean
  pos_x: number
  pos_y: number
  created_by: string | null
  created_at: string
  updated_at: string
  assignee?: Profile
  section?: Section
}

export interface TaskClaim {
  id: string
  task_id: string
  user_id: string
  created_at: string
  profile?: Profile
}

export interface TaskDocument {
  id: string
  task_id: string
  url: string
  name: string | null
  created_by: string | null
  created_at: string
}

export interface TaskHistory {
  id: string
  task_id: string
  user_id: string
  action: HistoryAction
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  profile?: Profile
}

export interface ProjectInvite {
  id: string
  project_id: string
  token: string
  created_by: string | null
  expires_at: string | null
  created_at: string
}

export interface ProjectWithDetails extends Project {
  members: ProjectMember[]
  checklist_items: ChecklistItem[]
  tasks: Task[]
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add TypeScript types"
```

---

### Task 3: Supabase Migration

**Files:**
- Create: `supabase/migrations/001_init.sql`

- [ ] **Step 1: Viết migration**

```sql
-- supabase/migrations/001_init.sql

-- Profiles
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name        text NOT NULL,
  avatar_url  text,
  byok_key    text,
  created_at  timestamptz DEFAULT now()
);

-- Projects
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  subject     text,
  description text,
  deadline    date NOT NULL,
  owner_id    uuid REFERENCES profiles NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Project members
CREATE TABLE project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles ON DELETE CASCADE,
  role        text DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Sections
CREATE TABLE sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  name        text NOT NULL,
  color       text DEFAULT '#EEEDFE',
  ord         integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Checklist items
CREATE TABLE checklist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  ord         integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects ON DELETE CASCADE,
  section_id        uuid REFERENCES sections ON DELETE SET NULL,
  checklist_item_id uuid REFERENCES checklist_items ON DELETE SET NULL,
  name              text NOT NULL,
  description       text,
  assignee_id       uuid REFERENCES profiles ON DELETE SET NULL,
  status            text DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done','blocked')),
  type              text DEFAULT 'output' CHECK (type IN ('output','coordination','research','review')),
  deadline          date,
  blocked_by_id     uuid REFERENCES tasks ON DELETE SET NULL,
  is_optional       boolean DEFAULT false,
  pos_x             float DEFAULT 0,
  pos_y             float DEFAULT 0,
  created_by        uuid REFERENCES profiles ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Task claims
CREATE TABLE task_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- Task documents
CREATE TABLE task_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks ON DELETE CASCADE,
  url         text NOT NULL,
  name        text,
  created_by  uuid REFERENCES profiles ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- Task history
CREATE TABLE task_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles ON DELETE SET NULL,
  action      text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Project invites
CREATE TABLE project_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_by  uuid REFERENCES profiles ON DELETE SET NULL,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- updated_at trigger for tasks
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE task_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE task_history;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;

-- Helper: is_project_member
CREATE OR REPLACE FUNCTION is_project_member(pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = pid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: is_project_owner
CREATE OR REPLACE FUNCTION is_project_owner(pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = pid AND user_id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- profiles policies
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- projects policies
CREATE POLICY "projects_select" ON projects FOR SELECT USING (is_project_member(id));
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (is_project_owner(id));
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (is_project_owner(id));

-- project_members policies
CREATE POLICY "members_select" ON project_members FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members_insert" ON project_members FOR INSERT WITH CHECK (
  is_project_owner(project_id) OR user_id = auth.uid()
);
CREATE POLICY "members_delete" ON project_members FOR DELETE USING (
  is_project_owner(project_id) OR user_id = auth.uid()
);

-- sections policies
CREATE POLICY "sections_select" ON sections FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "sections_insert" ON sections FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "sections_update" ON sections FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "sections_delete" ON sections FOR DELETE USING (is_project_owner(project_id));

-- checklist_items policies
CREATE POLICY "checklist_select" ON checklist_items FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "checklist_insert" ON checklist_items FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "checklist_update" ON checklist_items FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "checklist_delete" ON checklist_items FOR DELETE USING (is_project_owner(project_id));

-- tasks policies
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (is_project_owner(project_id));

-- task_claims policies
CREATE POLICY "claims_select" ON task_claims FOR SELECT USING (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "claims_insert" ON task_claims FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "claims_delete" ON task_claims FOR DELETE USING (user_id = auth.uid());

-- task_documents policies
CREATE POLICY "docs_select" ON task_documents FOR SELECT USING (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "docs_insert" ON task_documents FOR INSERT WITH CHECK (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "docs_delete" ON task_documents FOR DELETE USING (created_by = auth.uid());

-- task_history policies
CREATE POLICY "history_select" ON task_history FOR SELECT USING (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "history_insert" ON task_history FOR INSERT WITH CHECK (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);

-- project_invites policies
CREATE POLICY "invites_select" ON project_invites FOR SELECT USING (true);
CREATE POLICY "invites_insert" ON project_invites FOR INSERT WITH CHECK (is_project_owner(project_id));
CREATE POLICY "invites_delete" ON project_invites FOR DELETE USING (is_project_owner(project_id));
```

- [ ] **Step 2: Apply migration lên Supabase**

Mở Supabase Dashboard > SQL Editor > paste toàn bộ nội dung trên > Run.

Kiểm tra: vào Table Editor, thấy đủ 10 tables: profiles, projects, project_members, sections, checklist_items, tasks, task_claims, task_documents, task_history, project_invites.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema with RLS"
```

---

### Task 4: Supabase Client + Middleware

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `middleware.ts`
- Create: `lib/utils.ts`

- [ ] **Step 1: Tạo browser client**

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Tạo server client**

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Tạo middleware**

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/register', '/invite']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))

  if (!user && !isPublic && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 4: Tạo utils**

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDeadline(date: string): string {
  return format(new Date(date), 'dd/MM')
}

export function daysUntil(date: string): number {
  return differenceInDays(new Date(date), new Date())
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
```

Cài clsx và tailwind-merge nếu chưa có:
```bash
npm install clsx tailwind-merge
```

- [ ] **Step 5: Commit**

```bash
git add lib/ middleware.ts
git commit -m "feat: add Supabase client and auth middleware"
```

---

### Task 5: Root Layout + Auth Pages

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Create: `components/auth/LoginForm.tsx`
- Create: `components/auth/RegisterForm.tsx`

- [ ] **Step 1: Root layout**

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Grouply',
  description: 'Quản lý bài tập nhóm',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Root page redirect**

```typescript
// app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
```

- [ ] **Step 3: LoginForm component**

```typescript
// components/auth/LoginForm.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast({ title: 'Lỗi đăng nhập', description: error.message, variant: 'destructive' })
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/dashboard` },
    })
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" className="w-full" onClick={handleGoogle}>
        Đăng nhập với Google
      </Button>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Hoặc</span>
        </div>
      </div>
      <form onSubmit={handleEmail} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: RegisterForm component**

```typescript
// components/auth/RegisterForm.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

export function RegisterForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
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
      toast({ title: 'Lỗi đăng ký', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Đăng ký thành công', description: 'Kiểm tra email để xác nhận tài khoản.' })
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
```

- [ ] **Step 5: Login page**

```typescript
// app/(auth)/login/page.tsx
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
```

- [ ] **Step 6: Register page**

```typescript
// app/(auth)/register/page.tsx
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
```

- [ ] **Step 7: Test thủ công**

```bash
npm run dev
```

Mở http://localhost:3000 → redirect về /login. Đăng ký tài khoản mới → kiểm tra Supabase Dashboard > Authentication > Users thấy user mới. Đăng nhập → redirect về /dashboard (404 tạm thời, ok).

- [ ] **Step 8: Commit**

```bash
git add app/ components/auth/
git commit -m "feat: add auth pages (login, register, Google OAuth)"
```

---

### Task 6: Dashboard Page

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/dashboard/ProjectCard.tsx`
- Create: `components/project/MemberAvatarStack.tsx`

- [ ] **Step 1: MemberAvatarStack component**

```typescript
// components/project/MemberAvatarStack.tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { ProjectMember } from '@/types'

interface Props {
  members: ProjectMember[]
  max?: number
}

export function MemberAvatarStack({ members, max = 5 }: Props) {
  const visible = members.slice(0, max)
  const overflow = members.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map(m => (
        <Avatar key={m.id} className="h-7 w-7 border-2 border-white">
          <AvatarImage src={m.profile?.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">
            {getInitials(m.profile?.name ?? '?')}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div className="h-7 w-7 rounded-full border-2 border-white bg-muted flex items-center justify-center text-xs text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ProjectCard component**

```typescript
// components/dashboard/ProjectCard.tsx
import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MemberAvatarStack } from '@/components/project/MemberAvatarStack'
import { formatDeadline, daysUntil } from '@/lib/utils'
import type { Project, ProjectMember, ChecklistItem } from '@/types'

interface Props {
  project: Project
  members: ProjectMember[]
  checklistItems: ChecklistItem[]
  doneCount: number
}

export function ProjectCard({ project, members, checklistItems, doneCount }: Props) {
  const days = daysUntil(project.deadline)
  const total = checklistItems.length

  return (
    <Link href={`/project/${project.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm leading-tight">{project.name}</h3>
              {project.subject && (
                <p className="text-xs text-muted-foreground mt-0.5">{project.subject}</p>
              )}
            </div>
            <Badge variant={days < 3 ? 'destructive' : 'secondary'} className="text-xs shrink-0">
              {formatDeadline(project.deadline)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{doneCount}/{total} items ✓</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          <MemberAvatarStack members={members} max={5} />
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 3: Dashboard page**

```typescript
// app/dashboard/page.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ProjectCard } from '@/components/dashboard/ProjectCard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Lấy projects user là member
  const { data: memberships } = await supabase
    .from('project_members')
    .select(`
      project_id,
      projects (
        id, name, subject, deadline, owner_id, created_at,
        project_members (
          id, user_id, role, joined_at,
          profile:profiles (id, name, avatar_url)
        ),
        checklist_items (id, name, ord)
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  // Lấy done count cho mỗi project
  const projectIds = (memberships ?? []).map(m => m.project_id)
  const { data: doneTasks } = await supabase
    .from('tasks')
    .select('project_id, checklist_item_id')
    .in('project_id', projectIds)
    .eq('status', 'done')
    .not('checklist_item_id', 'is', null)

  const doneByProject = (doneTasks ?? []).reduce<Record<string, Set<string>>>((acc, t) => {
    if (!acc[t.project_id]) acc[t.project_id] = new Set()
    acc[t.project_id].add(t.checklist_item_id)
    return acc
  }, {})

  async function handleSignOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">Grouply</span>
        <form action={handleSignOut}>
          <Button variant="ghost" size="sm" type="submit">Đăng xuất</Button>
        </form>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Projects của bạn</h1>
          <Button asChild>
            <Link href="/project/new">+ Tạo project mới</Link>
          </Button>
        </div>
        {(!memberships || memberships.length === 0) ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Chưa có project nào.</p>
            <Button asChild className="mt-4">
              <Link href="/project/new">Tạo project đầu tiên</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {memberships.map(m => {
              const project = m.projects as any
              if (!project) return null
              const members = project.project_members ?? []
              const checklistItems = project.checklist_items ?? []
              const doneItemIds = doneByProject[project.id] ?? new Set()
              const doneCount = checklistItems.filter((ci: any) => doneItemIds.has(ci.id)).length
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  members={members}
                  checklistItems={checklistItems}
                  doneCount={doneCount}
                />
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Test thủ công**

```bash
npm run dev
```

Đăng nhập → thấy dashboard trống với nút "Tạo project mới". Sign out hoạt động.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/ components/dashboard/ components/project/MemberAvatarStack.tsx
git commit -m "feat: add dashboard with project cards"
```

---

### Task 7: Tạo Project

**Files:**
- Create: `app/project/new/page.tsx`
- Create: `components/project/CreateProjectForm.tsx`

- [ ] **Step 1: CreateProjectForm**

```typescript
// components/project/CreateProjectForm.tsx
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
import { useToast } from '@/hooks/use-toast'

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
  const { toast } = useToast()
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      // Tạo project
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

      // Tạo section mặc định 'Chung'
      await supabase.from('sections').insert({
        project_id: project.id,
        name: 'Chung',
        color: '#EEEDFE',
        ord: 0,
      })

      // Thêm owner vào project_members
      await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: userId,
        role: 'owner',
      })

      router.push(`/project/${project.id}`)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Lỗi', description: err.message, variant: 'destructive' })
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
```

- [ ] **Step 2: Trang /project/new**

```typescript
// app/project/new/page.tsx
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
```

- [ ] **Step 3: Test thủ công**

Tạo project → kiểm tra Supabase Table Editor: bảng `projects` có 1 row, `sections` có 1 row tên 'Chung', `project_members` có 1 row role='owner'. Sau submit redirect sang `/project/[id]` (404 tạm thời).

- [ ] **Step 4: Commit**

```bash
git add app/project/new/ components/project/CreateProjectForm.tsx
git commit -m "feat: add create project form"
```

---

### Task 8: Workspace Shell + List View

**Files:**
- Create: `app/project/[id]/page.tsx`
- Create: `app/project/[id]/list/page.tsx`
- Create: `components/task/TaskList.tsx`
- Create: `components/task/TaskRow.tsx`
- Create: `components/task/StatusBadge.tsx`
- Create: `components/task/CreateTaskDialog.tsx`
- Create: `components/section/SectionAccordion.tsx`
- Create: `components/section/CreateSectionDialog.tsx`
- Create: `components/project/InviteButton.tsx`

- [ ] **Step 1: StatusBadge component**

```typescript
// components/task/StatusBadge.tsx
import { Badge } from '@/components/ui/badge'
import type { TaskStatus } from '@/types'

const CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  todo:    { label: 'Chưa làm', className: 'bg-gray-100 text-gray-700' },
  doing:   { label: 'Đang làm', className: 'bg-blue-100 text-blue-700' },
  review:  { label: 'Review',   className: 'bg-amber-100 text-amber-800' },
  done:    { label: 'Xong',     className: 'bg-teal-100 text-teal-700' },
  blocked: { label: 'Bị block', className: 'bg-red-100 text-red-700' },
}

interface Props {
  status: TaskStatus
  onClick?: () => void
}

export function StatusBadge({ status, onClick }: Props) {
  const { label, className } = CONFIG[status]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer select-none ${className}`}
      onClick={onClick}
    >
      {label}
    </span>
  )
}
```

- [ ] **Step 2: CreateTaskDialog**

```typescript
// components/task/CreateTaskDialog.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
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
  const { toast } = useToast()
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
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' })
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
```

- [ ] **Step 3: TaskRow component**

```typescript
// components/task/TaskRow.tsx
'use client'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from './StatusBadge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatDeadline, getInitials } from '@/lib/utils'
import type { Task, TaskStatus } from '@/types'

const STATUS_CYCLE: TaskStatus[] = ['todo', 'doing', 'review', 'done']

interface Props {
  task: Task
  onUpdated: () => void
}

export function TaskRow({ task, onUpdated }: Props) {
  const supabase = createClient()

  async function cycleStatus() {
    const idx = STATUS_CYCLE.indexOf(task.status as TaskStatus)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    onUpdated()
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b last:border-0">
      <StatusBadge status={task.status as TaskStatus} onClick={cycleStatus} />
      <span className="flex-1 text-sm truncate">{task.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {task.type}
      </span>
      {task.deadline && (
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDeadline(task.deadline)}
        </span>
      )}
      {task.assignee && (
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarImage src={task.assignee.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">{getInitials(task.assignee.name)}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
```

- [ ] **Step 4: SectionAccordion component**

```typescript
// components/section/SectionAccordion.tsx
'use client'
import { useState } from 'react'
import { TaskRow } from '@/components/task/TaskRow'
import type { Section, Task } from '@/types'

interface Props {
  section: Section
  tasks: Task[]
  onUpdated: () => void
}

export function SectionAccordion({ section, tasks, onUpdated }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border rounded-lg overflow-hidden mb-3">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
        style={{ borderLeft: `4px solid ${section.color}` }}
        onClick={() => setOpen(o => !o)}
      >
        <span>{section.name}</span>
        <span className="text-muted-foreground text-xs">{tasks.length} tasks {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div>
          {tasks.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Chưa có task nào.</p>
          ) : (
            tasks.map(t => <TaskRow key={t.id} task={t} onUpdated={onUpdated} />)
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: CreateSectionDialog**

```typescript
// components/section/CreateSectionDialog.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

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
  const { toast } = useToast()
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
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' })
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
```

- [ ] **Step 6: InviteButton**

```typescript
// components/project/InviteButton.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

export function InviteButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  async function generateInvite() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_invites')
      .insert({ project_id: projectId })
      .select()
      .single()

    if (error || !data) {
      toast({ title: 'Lỗi', description: error?.message, variant: 'destructive' })
    } else {
      const link = `${window.location.origin}/invite/${data.token}`
      await navigator.clipboard.writeText(link)
      toast({ title: 'Đã copy link invite', description: link })
    }
    setLoading(false)
  }

  return (
    <Button variant="outline" size="sm" onClick={generateInvite} disabled={loading}>
      {loading ? '...' : '+ Mời thành viên'}
    </Button>
  )
}
```

- [ ] **Step 7: TaskList component**

```typescript
// components/task/TaskList.tsx
'use client'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SectionAccordion } from '@/components/section/SectionAccordion'
import { CreateTaskDialog } from './CreateTaskDialog'
import { CreateSectionDialog } from '@/components/section/CreateSectionDialog'
import type { Section, Task } from '@/types'

interface Props {
  projectId: string
  userId: string
  initialSections: Section[]
  initialTasks: Task[]
}

export function TaskList({ projectId, userId, initialSections, initialTasks }: Props) {
  const [sections, setSections] = useState(initialSections)
  const [tasks, setTasks] = useState(initialTasks)
  const supabase = createClient()

  const reload = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('sections').select('*').eq('project_id', projectId).order('ord'),
      supabase.from('tasks')
        .select('*, assignee:profiles(*), section:sections(*)')
        .eq('project_id', projectId)
        .order('created_at'),
    ])
    if (s) setSections(s)
    if (t) setTasks(t as Task[])
  }, [projectId, supabase])

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <CreateSectionDialog
          projectId={projectId}
          currentCount={sections.length}
          onCreated={reload}
        />
        <CreateTaskDialog
          projectId={projectId}
          sections={sections}
          userId={userId}
          onCreated={reload}
        />
      </div>
      {sections.map(section => (
        <SectionAccordion
          key={section.id}
          section={section}
          tasks={tasks.filter(t => t.section_id === section.id)}
          onUpdated={reload}
        />
      ))}
      {tasks.filter(t => !t.section_id).length > 0 && (
        <SectionAccordion
          section={{ id: '', project_id: projectId, name: 'Không có section', color: '#D3D1C7', ord: 999, created_at: '' }}
          tasks={tasks.filter(t => !t.section_id)}
          onUpdated={reload}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Workspace page (shell)**

```typescript
// app/project/[id]/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteButton } from '@/components/project/InviteButton'
import { TaskList } from '@/components/task/TaskList'
import { formatDeadline } from '@/lib/utils'
import type { Task, Section } from '@/types'

export default async function WorkspacePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!project) redirect('/dashboard')

  const { data: membership } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/dashboard')

  const [{ data: sections }, { data: tasks }, { data: members }] = await Promise.all([
    supabase.from('sections').select('*').eq('project_id', params.id).order('ord'),
    supabase.from('tasks')
      .select('*, assignee:profiles(*), section:sections(*)')
      .eq('project_id', params.id)
      .order('created_at'),
    supabase.from('project_members')
      .select('*, profile:profiles(*)')
      .eq('project_id', params.id),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold">Grouply</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{project.name}</span>
          {project.subject && <span className="text-sm text-muted-foreground">{project.subject}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Deadline: {formatDeadline(project.deadline)}</span>
          {membership.role === 'owner' && <InviteButton projectId={project.id} />}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <TaskList
          projectId={project.id}
          userId={user.id}
          initialSections={(sections ?? []) as Section[]}
          initialTasks={(tasks ?? []) as Task[]}
        />
      </main>
    </div>
  )
}
```

- [ ] **Step 9: Test thủ công**

Tạo project → vào workspace → thêm section → thêm task → click status badge → status cycle. Tất cả hoạt động.

- [ ] **Step 10: Commit**

```bash
git add app/project/ components/task/ components/section/ components/project/InviteButton.tsx
git commit -m "feat: add workspace list view with task/section CRUD"
```

---

### Task 9: Invite Flow

**Files:**
- Create: `app/invite/[token]/page.tsx`

- [ ] **Step 1: Invite accept page**

```typescript
// app/invite/[token]/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function InvitePage({ params }: { params: { token: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/invite/${params.token}`)
  }

  const { data: invite } = await supabase
    .from('project_invites')
    .select('*, project:projects(id, name)')
    .eq('token', params.token)
    .single()

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Link không hợp lệ</h1>
          <p className="text-muted-foreground">Link invite này đã hết hạn hoặc không tồn tại.</p>
          <Button asChild><a href="/dashboard">Về Dashboard</a></Button>
        </div>
      </div>
    )
  }

  // Check đã là member chưa
  const { data: existing } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', invite.project_id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    redirect(`/project/${invite.project_id}`)
  }

  async function acceptInvite() {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    await supabase.from('project_members').insert({
      project_id: invite.project_id,
      user_id: user.id,
      role: 'member',
    })

    redirect(`/project/${invite.project_id}`)
  }

  const project = invite.project as any

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border p-8 max-w-sm w-full text-center space-y-4">
        <h1 className="text-xl font-semibold">Bạn được mời tham gia</h1>
        <p className="text-2xl font-bold">{project?.name}</p>
        <form action={acceptInvite}>
          <Button type="submit" className="w-full">Tham gia project</Button>
        </form>
        <Button variant="ghost" asChild className="w-full">
          <a href="/dashboard">Từ chối</a>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Cập nhật login để handle redirect**

Mở `components/auth/LoginForm.tsx`, sửa `handleEmail` và `handleGoogle` để đọc `redirect` param từ URL:

```typescript
// Thêm vào đầu LoginForm function:
const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
const redirectTo = searchParams.get('redirect') ?? '/dashboard'

// Sửa handleEmail:
router.push(redirectTo)

// Sửa handleGoogle:
options: { redirectTo: `${location.origin}${redirectTo}` }
```

- [ ] **Step 3: Test thủ công**

Dùng InviteButton tạo link → copy → mở tab ẩn danh → paste link → thấy trang mời → tham gia → vào được workspace. Kiểm tra `project_members` có row mới.

- [ ] **Step 4: Commit**

```bash
git add app/invite/
git commit -m "feat: add invite accept flow"
```

---

### Task 10: Settings Page

**Files:**
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Settings page**

```typescript
// app/settings/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [byokKey, setByokKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const { toast } = useToast()
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
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Đã lưu' })
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
```

- [ ] **Step 2: Commit**

```bash
git add app/settings/
git commit -m "feat: add settings page with BYOK key"
```

---

### Task 11: Sprint 1 Verification

- [ ] **Step 1: Chạy TypeScript check**

```bash
npx tsc --noEmit
```

Expected: không có lỗi type.

- [ ] **Step 2: End-to-end smoke test thủ công**

Checklist:
1. `/` → redirect `/login` ✓
2. Đăng ký email mới → email confirm (hoặc disable confirm trong Supabase > Auth > Settings) ✓
3. Đăng nhập → `/dashboard` ✓
4. Tạo project với deadline → redirect workspace ✓
5. Thêm section mới ✓
6. Thêm task với status/type/deadline ✓
7. Click status badge → cycle todo→doing→review→done ✓
8. Tạo invite link → copy → open incognito → join → vào được workspace ✓
9. Dashboard hiện project card với checklist progress ✓
10. Settings → thay tên → lưu ✓

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: sprint 1 complete — auth, dashboard, task CRUD, invite"
```
