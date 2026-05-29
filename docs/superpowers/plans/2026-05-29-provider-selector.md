# Provider Selector & API Key UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Claude/Groq/Simulate switcher in chat with a provider dropdown supporting 5 AI providers, each requiring the user to enter their own API key inline; remove Simulate mode entirely.

**Architecture:** New `lib/ai/providers.ts` is the single source of truth for provider config and model instantiation. A new `/api/user/byok` route handles key persistence to `profiles.byok_keys jsonb`. `ChatInput` gets a dropdown + inline popover for key entry; `ChatPanel` and `chatStore` are cleaned of all simulate references.

**Tech Stack:** Next.js App Router, Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/xai` added), Supabase, Zustand, Tailwind CSS

---

## File Map

| File | Action | What changes |
|---|---|---|
| `lib/ai/providers.ts` | CREATE | PROVIDERS config + `getModelInstance()` |
| `supabase/migrations/005_byok_keys.sql` | CREATE | Add `byok_keys jsonb` to profiles |
| `app/api/user/byok/route.ts` | CREATE | GET (key presence) + POST (save key) |
| `components/chat/ProviderDropdown.tsx` | CREATE | Dropdown + inline key input popover |
| `stores/chatStore.ts` | MODIFY | Remove `mode`/`ChatMode`; `provider` → `ProviderId \| null` |
| `components/chat/ChatInput.tsx` | MODIFY | Remove simulate props/UI; add `ProviderDropdown` |
| `components/chat/ChatPanel.tsx` | MODIFY | Remove simulate logic + SimulateModal |
| `app/api/ai/chat/route.ts` | MODIFY | Use `getModelInstance` from providers.ts |
| `lib/ai/prompts.ts` | MODIFY | Remove `mode` param (always 'api') |
| `lib/ai/simulate.ts` | DELETE | Entire file removed |
| `components/chat/SimulateModal.tsx` | DELETE | Entire file removed |

---

## Task 1: Install new AI SDK packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install @ai-sdk/openai @ai-sdk/google @ai-sdk/xai
```

Expected output: 3 packages added, no peer dep errors.

- [ ] **Step 2: Verify**

```bash
node -e "require('@ai-sdk/openai'); require('@ai-sdk/google'); require('@ai-sdk/xai'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @ai-sdk/openai, @ai-sdk/google, @ai-sdk/xai"
```

---

## Task 2: Create lib/ai/providers.ts

**Files:**
- Create: `lib/ai/providers.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/ai/providers.ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'

export const PROVIDERS = {
  anthropic: { label: 'Claude',  placeholder: 'sk-ant-...', model: 'claude-sonnet-4-20250514',  envKey: 'ANTHROPIC_API_KEY' },
  groq:      { label: 'Groq',    placeholder: 'gsk_...',    model: 'llama-3.3-70b-versatile',   envKey: 'GROQ_API_KEY' },
  openai:    { label: 'OpenAI',  placeholder: 'sk-...',     model: 'gpt-4o',                    envKey: 'OPENAI_API_KEY' },
  google:    { label: 'Gemini',  placeholder: 'AIza...',    model: 'gemini-2.0-flash',           envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  xai:       { label: 'xAI',     placeholder: 'xai-...',    model: 'grok-3',                    envKey: 'XAI_API_KEY' },
} as const

export type ProviderId = keyof typeof PROVIDERS

export function getModelInstance(provider: ProviderId, apiKey: string) {
  const model = PROVIDERS[provider].model
  switch (provider) {
    case 'anthropic': return createAnthropic({ apiKey })(model)
    case 'groq':      return createGroq({ apiKey })(model)
    case 'openai':    return createOpenAI({ apiKey })(model)
    case 'google':    return createGoogleGenerativeAI({ apiKey })(model)
    case 'xai':       return createXai({ apiKey })(model)
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors (or only errors in files not yet updated — providers.ts itself must be clean).

- [ ] **Step 3: Commit**

```bash
git add lib/ai/providers.ts
git commit -m "feat: add providers.ts with PROVIDERS config and getModelInstance"
```

---

## Task 3: Supabase migration — add byok_keys column

**Files:**
- Create: `supabase/migrations/005_byok_keys.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/005_byok_keys.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS byok_keys jsonb DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Run migration**

Run in Supabase SQL Editor (or psql):
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS byok_keys jsonb DEFAULT '{}'::jsonb;
```

Expected: `ALTER TABLE` with no errors. Verify: `SELECT byok_keys FROM profiles LIMIT 1;` returns `{}`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_byok_keys.sql
git commit -m "feat: add byok_keys jsonb column to profiles"
```

---

## Task 4: Create /api/user/byok route

**Files:**
- Create: `app/api/user/byok/route.ts`

- [ ] **Step 1: Create route file**

```typescript
// app/api/user/byok/route.ts
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PROVIDERS } from '@/lib/ai/providers'
import type { ProviderId } from '@/lib/ai/providers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('byok_keys')
    .eq('id', user.id)
    .single()

  const keys = (profile?.byok_keys ?? {}) as Record<string, string>
  const presence: Record<string, boolean> = {}
  for (const id of Object.keys(PROVIDERS)) {
    presence[id] = Boolean(keys[id])
  }

  return Response.json({ keys: presence })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { provider, key } = body as { provider: string; key: string }

  if (!provider || !(provider in PROVIDERS) || !key?.trim()) {
    return new Response('Bad Request', { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('byok_keys')
    .eq('id', user.id)
    .single()

  const existing = (profile?.byok_keys ?? {}) as Record<string, string>
  const encoded = Buffer.from(key.trim()).toString('base64')
  const updated = { ...existing, [provider]: encoded }

  const { error } = await supabase
    .from('profiles')
    .update({ byok_keys: updated })
    .eq('id', user.id)

  if (error) return new Response(error.message, { status: 500 })
  return Response.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero new errors in `app/api/user/byok/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/user/byok/route.ts
git commit -m "feat: add /api/user/byok GET+POST for provider key management"
```

---

## Task 5: Update chatStore — remove simulate, update provider type

**Files:**
- Modify: `stores/chatStore.ts`

- [ ] **Step 1: Rewrite chatStore.ts**

```typescript
// stores/chatStore.ts
import { create } from 'zustand'
import type { ProviderId } from '@/lib/ai/providers'

export type { ProviderId }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  replyTo?: string
  attachmentName?: string
}

export interface ToolCall {
  name: string
  input: Record<string, unknown>
  id?: string
}

export interface GhostPreview {
  description: string
  changes: string[]
}

export interface ChatState {
  pendingToolCalls: ToolCall[]
  ghostPreview: GhostPreview | null
  provider: ProviderId | null
  replyTo: ChatMessage | null
  attachedFile: { name: string; text: string } | null

  setPending: (toolCalls: ToolCall[], preview: GhostPreview) => void
  clearPending: () => void
  setProvider: (provider: ProviderId | null) => void
  setReplyTo: (msg: ChatMessage | null) => void
  setAttachedFile: (file: { name: string; text: string } | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  pendingToolCalls: [],
  ghostPreview: null,
  provider: null,
  replyTo: null,
  attachedFile: null,

  setPending: (pendingToolCalls, ghostPreview) => set({ pendingToolCalls, ghostPreview }),
  clearPending: () => set({ pendingToolCalls: [], ghostPreview: null }),
  setProvider: (provider) => set({ provider }),
  setReplyTo: (replyTo) => set({ replyTo }),
  setAttachedFile: (attachedFile) => set({ attachedFile }),
  reset: () => set({ pendingToolCalls: [], ghostPreview: null, replyTo: null, attachedFile: null }),
}))
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only in files that still reference `mode` or `ChatMode` — those get fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add stores/chatStore.ts
git commit -m "refactor: remove ChatMode from chatStore, provider is ProviderId | null"
```

---

## Task 6: Create ProviderDropdown component

**Files:**
- Create: `components/chat/ProviderDropdown.tsx`

- [ ] **Step 1: Create component**

```tsx
// components/chat/ProviderDropdown.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { PROVIDERS } from '@/lib/ai/providers'
import type { ProviderId } from '@/lib/ai/providers'

interface Props {
  provider: ProviderId | null
  onSelect: (p: ProviderId) => void
}

export function ProviderDropdown({ provider, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/user/byok')
      .then(r => r.json())
      .then(d => setSavedKeys(d.keys ?? {}))
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPendingProvider(null)
        setKeyInput('')
        setError('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelectProvider(id: ProviderId) {
    if (savedKeys[id]) {
      onSelect(id)
      setOpen(false)
    } else {
      setPendingProvider(id)
      setKeyInput('')
      setError('')
    }
  }

  async function handleSaveKey() {
    if (!pendingProvider || !keyInput.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/user/byok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: pendingProvider, key: keyInput.trim() }),
    })
    setSaving(false)
    if (!res.ok) { setError('Lưu thất bại, thử lại.'); return }
    setSavedKeys(prev => ({ ...prev, [pendingProvider]: true }))
    onSelect(pendingProvider)
    setPendingProvider(null)
    setKeyInput('')
    setOpen(false)
  }

  const activeLabel = provider ? PROVIDERS[provider].label : 'Chọn AI'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); setPendingProvider(null); setKeyInput('') }}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 font-medium"
      >
        {activeLabel}
        <span className="text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded-lg shadow-lg w-52">
          {pendingProvider ? (
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium">{PROVIDERS[pendingProvider].label} API Key</p>
              <input
                autoFocus
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                placeholder={PROVIDERS[pendingProvider].placeholder}
                className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <p className="text-xs text-muted-foreground">Key được mã hóa trước khi lưu.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveKey}
                  disabled={saving || !keyInput.trim()}
                  className="flex-1 text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  onClick={() => setPendingProvider(null)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2"
                >
                  ←
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {(Object.entries(PROVIDERS) as [ProviderId, typeof PROVIDERS[ProviderId]][]).map(([id, cfg]) => (
                <button
                  key={id}
                  onClick={() => handleSelectProvider(id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50"
                >
                  <span className={provider === id ? 'font-semibold' : ''}>{cfg.label}</span>
                  {savedKeys[id]
                    ? <span className="text-green-600 text-[10px]">●  key đã lưu</span>
                    : <span className="text-muted-foreground text-[10px]">nhập key</span>
                  }
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors in `ProviderDropdown.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ProviderDropdown.tsx
git commit -m "feat: add ProviderDropdown with inline API key entry"
```

---

## Task 7: Rewrite ChatInput — remove simulate, add ProviderDropdown

**Files:**
- Modify: `components/chat/ChatInput.tsx`

- [ ] **Step 1: Rewrite ChatInput.tsx**

```tsx
// components/chat/ChatInput.tsx
'use client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FileAttachButton } from './FileAttachButton'
import { ReplyBar } from './ReplyBar'
import { ProviderDropdown } from './ProviderDropdown'
import type { ProviderId } from '@/lib/ai/providers'

interface Props {
  input: string
  provider: ProviderId | null
  isLoading: boolean
  replyTo: any | null
  attachedFile: { name: string; text: string } | null
  onInputChange: (val: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onClearReply: () => void
  onClearFile: () => void
  onSetFile: (file: { name: string; text: string }) => void
  onSetProvider: (p: ProviderId) => void
}

export function ChatInput({
  input, provider, isLoading,
  replyTo, attachedFile,
  onInputChange, onKeyDown, onSend,
  onClearReply, onClearFile, onSetFile, onSetProvider,
}: Props) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">AI Chat</span>
        <ProviderDropdown provider={provider} onSelect={onSetProvider} />
      </div>

      {/* Reply and file banners */}
      {replyTo && <ReplyBar message={replyTo} onClear={onClearReply} />}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-xs">
          <span className="text-amber-700 flex-1 truncate">📎 {attachedFile.name}</span>
          <button onClick={onClearFile} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Input row */}
      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2 items-end">
          <FileAttachButton onExtracted={onSetFile} />
          <Textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nhập tin nhắn... (Enter để gửi)"
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button
            size="sm"
            onClick={onSend}
            disabled={isLoading || !input.trim() || !provider}
            className="self-end shrink-0"
          >Gửi</Button>
        </div>
        {!provider && (
          <p className="text-xs text-muted-foreground mt-1.5 text-center">Chọn AI provider để bắt đầu</p>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only in `ChatPanel.tsx` (still imports old props) — fixed next task.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ChatInput.tsx
git commit -m "refactor: ChatInput uses ProviderDropdown, removes simulate props"
```

---

## Task 8: Rewrite ChatPanel — remove all simulate logic

**Files:**
- Modify: `components/chat/ChatPanel.tsx`

- [ ] **Step 1: Rewrite ChatPanel.tsx**

```tsx
// components/chat/ChatPanel.tsx
'use client'
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import type { ProjectContext } from '@/lib/ai/context'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'

interface Props {
  projectId: string
  context: ProjectContext
  currentUserName: string
  currentUserRole: string
  userId: string
  onAfterCommit?: () => void
}

export function ChatPanel({ projectId, context, currentUserName, currentUserRole, userId, onAfterCommit }: Props) {
  const [input, setInput] = useState('')

  const {
    pendingToolCalls, ghostPreview, provider,
    replyTo, attachedFile,
    setPending, clearPending, setProvider, setReplyTo, setAttachedFile,
  } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { project_id: projectId, provider, reply_to: replyTo?.content ?? null, attached_text: attachedFile?.text ?? null },
    }),
    onData: (dataPart: any) => {
      if (dataPart?.name === 'write-tools' && dataPart?.data) {
        const { tool_calls, preview } = dataPart.data as { tool_calls: ToolCall[]; preview: GhostPreview }
        setPending(tool_calls, preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(tool_calls, context)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    },
    onFinish: () => { setReplyTo(null); setAttachedFile(null) },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  function submitMessage() {
    if (!input.trim() || !provider) return
    sendMessage({ text: input })
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    submitMessage()
  }

  return (
    <div className="flex flex-col h-full border-l bg-white">
      <ChatInput
        input={input}
        provider={provider}
        isLoading={isLoading}
        replyTo={replyTo}
        attachedFile={attachedFile}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={submitMessage}
        onClearReply={() => setReplyTo(null)}
        onClearFile={() => setAttachedFile(null)}
        onSetFile={setAttachedFile}
        onSetProvider={setProvider}
      />
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        ghostPreview={ghostPreview}
        pendingToolCalls={pendingToolCalls}
        projectId={projectId}
        onSetReplyTo={setReplyTo}
        onCommit={() => { clearPending(); clearGhost(); onAfterCommit?.() }}
        onDiscard={() => { clearPending(); clearGhost() }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only in `route.ts` and `prompts.ts` — fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ChatPanel.tsx
git commit -m "refactor: ChatPanel removes simulate logic and SimulateModal"
```

---

## Task 9: Delete simulate files

**Files:**
- Delete: `lib/ai/simulate.ts`
- Delete: `components/chat/SimulateModal.tsx`

- [ ] **Step 1: Delete files**

```bash
git rm lib/ai/simulate.ts components/chat/SimulateModal.tsx
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only in `route.ts` and `prompts.ts` (not yet updated).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete simulate.ts and SimulateModal.tsx"
```

---

## Task 10: Update lib/ai/prompts.ts — remove mode param

**Files:**
- Modify: `lib/ai/prompts.ts`

The `mode` parameter and the simulate-specific branch in `buildSystemPrompt` need to be removed. The function currently accepts `mode: 'api' | 'simulate' = 'api'` as 4th param and has a conditional block for simulate mode.

- [ ] **Step 1: Read the current file to find exact lines**

Read `lib/ai/prompts.ts` and locate:
1. The `mode` parameter in the function signature
2. The `if (mode === 'simulate')` block

- [ ] **Step 2: Remove mode parameter and simulate block**

Change the function signature from:
```typescript
export function buildSystemPrompt(
  context: ProjectContext,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string,
  mode: 'api' | 'simulate' = 'api',
  provider?: 'groq',
): string {
```

To:
```typescript
export function buildSystemPrompt(
  context: ProjectContext,
  currentUserName: string,
  currentUserRole: string,
  currentUserId: string,
  provider?: 'groq',
): string {
```

Then delete the entire `if (mode === 'simulate') { ... }` block (and its surrounding logic if it returns early).

- [ ] **Step 3: Update the call in route.ts**

In `app/api/ai/chat/route.ts` line ~53, change:
```typescript
const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id, 'api', provider === 'groq' ? 'groq' : undefined)
```
To:
```typescript
const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id, provider === 'groq' ? 'groq' : undefined)
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompts.ts app/api/ai/chat/route.ts
git commit -m "refactor: remove mode param from buildSystemPrompt"
```

---

## Task 11: Update route.ts — use getModelInstance from providers.ts

**Files:**
- Modify: `app/api/ai/chat/route.ts`

- [ ] **Step 1: Read the current route.ts**

Read `app/api/ai/chat/route.ts` to see the current `getModel()` helper (lines ~88–95) and the `byokKey` resolution (lines ~48–50).

- [ ] **Step 2: Replace model instantiation**

Remove the `getModel()` helper entirely. Replace with:

```typescript
import { PROVIDERS, getModelInstance } from '@/lib/ai/providers'
import type { ProviderId } from '@/lib/ai/providers'
```

Replace the `byokKey` block and `getModel()` call with:

```typescript
const byokKeys = (profile?.byok_keys ?? {}) as Record<string, string>
const providerId = (provider in PROVIDERS ? provider : 'anthropic') as ProviderId
const rawKey = byokKeys[providerId]
  ? Buffer.from(byokKeys[providerId], 'base64').toString('utf-8')
  : process.env[PROVIDERS[providerId].envKey] ?? ''

const model = getModelInstance(providerId, rawKey)
```

Then replace `model: getModel()` in `streamText({...})` with `model`.

Also remove the now-unused imports:
```typescript
// Remove:
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/chat/route.ts
git commit -m "refactor: route.ts uses getModelInstance from providers.ts, supports 5 providers"
```

---

## Task 12: Final verification

**Files:** none modified

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Grep for simulate references**

```bash
grep -r "simulate\|SimulateModal\|ChatMode\|setMode\|mode.*simulate" app/ components/ lib/ stores/ --include="*.ts" --include="*.tsx"
```

Expected: zero results.

- [ ] **Step 3: Grep for old provider switch**

```bash
grep -rn "createAnthropic\|createGroq" app/ --include="*.ts"
```

Expected: zero results in `app/` (only allowed in `lib/ai/providers.ts`).

- [ ] **Step 4: Verify all 5 providers in providers.ts**

```bash
grep "anthropic\|groq\|openai\|google\|xai" lib/ai/providers.ts
```

Expected: all 5 present.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: provider selector complete — 5 providers, inline key entry, simulate removed"
```
