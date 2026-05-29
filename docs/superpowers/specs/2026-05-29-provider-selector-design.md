# Provider Selector & API Key UI — Design Spec

**Date:** 2026-05-29  
**Scope:** Replace chat header provider/mode switcher with multi-provider dropdown + inline API key entry. Remove Simulate mode entirely.

---

## 1. Goals

- Support 5 AI providers: Anthropic, Groq, OpenAI, Google, xAI
- User enters their own API key per provider, stored encrypted in DB
- Cannot send message without selecting a provider and having a valid key
- Remove Simulate mode completely from UI, store, and backend

---

## 2. Provider Config

```typescript
// lib/ai/providers.ts  (NEW)
export const PROVIDERS = {
  anthropic: { label: 'Claude',   model: 'claude-sonnet-4-20250514',   envKey: 'ANTHROPIC_API_KEY' },
  groq:      { label: 'Groq',     model: 'llama-3.3-70b-versatile',    envKey: 'GROQ_API_KEY' },
  openai:    { label: 'OpenAI',   model: 'gpt-4o',                     envKey: 'OPENAI_API_KEY' },
  google:    { label: 'Gemini',   model: 'gemini-2.0-flash',           envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  xai:       { label: 'xAI',      model: 'grok-3',                     envKey: 'XAI_API_KEY' },
} as const

export type ProviderId = keyof typeof PROVIDERS
```

---

## 3. Database

New migration adds `byok_keys jsonb` column to `profiles`:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS byok_keys jsonb DEFAULT '{}'::jsonb;
```

Shape: `{ "anthropic": "<encrypted>", "groq": "<encrypted>", ... }`

Old `byok_key` column left intact (backward compat — settings page still uses it for Anthropic).

---

## 4. UI: Chat Header

**Before:** Two separate pill switchers — provider (Claude/Groq) and mode (API/Simulate)  
**After:** Single dropdown labeled with the active provider name, or "Chọn AI" if none selected

```
[ AI Chat ]  [ Claude ▾ ]
```

Clicking the dropdown opens a `<select>`-style popover listing all 5 providers. Selecting one:

1. If key already saved for that provider → closes dropdown, provider active
2. If no key → inline popover stays open, shows input:

```
┌─────────────────────────────┐
│ Claude API Key              │
│ [sk-ant-...           ] [✓] │
│ Key được mã hóa trước khi   │
│ lưu. Không chia sẻ với ai.  │
└─────────────────────────────┘
```

- Input type=password, placeholder = provider-specific (e.g. `sk-ant-...` for Anthropic)
- Lưu → POST to new `/api/user/byok` endpoint → re-close popover
- If key already exists → show `••••••••` with an "Đổi key" link that clears and re-shows input

**Send button disabled** when `provider === null` or no key saved for active provider.

---

## 5. New API Route: /api/user/byok

```
POST /api/user/byok
Body: { provider: ProviderId, key: string }
Response: { ok: true }
```

- Reads existing `byok_keys`, merges new key (base64-encoded), writes back
- Returns 400 if `provider` not in PROVIDERS or key is empty

```
GET /api/user/byok
Response: { keys: Record<ProviderId, boolean> }  // true = key exists, never returns actual key
```

Client uses GET on mount to know which providers already have keys.

---

## 6. Chat Route Changes (route.ts)

```typescript
// Resolve model from provider
import { PROVIDERS } from '@/lib/ai/providers'

const providerConfig = PROVIDERS[provider as ProviderId]
const byokKeys = (profile?.byok_keys ?? {}) as Record<string, string>
const rawKey = byokKeys[provider]
  ? Buffer.from(byokKeys[provider], 'base64').toString('utf-8')
  : process.env[providerConfig.envKey]

const model = getModelInstance(provider, rawKey, providerConfig.model)
```

`getModelInstance` is a new helper in `lib/ai/providers.ts`:

```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'

export function getModelInstance(provider: ProviderId, apiKey: string, model: string) {
  switch (provider) {
    case 'anthropic': return createAnthropic({ apiKey })(model)
    case 'groq':      return createGroq({ apiKey })(model)
    case 'openai':    return createOpenAI({ apiKey })(model)
    case 'google':    return createGoogleGenerativeAI({ apiKey })(model)
    case 'xai':       return createXai({ apiKey })(model)
  }
}
```

---

## 7. Store Changes (chatStore.ts)

Remove:
- `ChatMode` type and `mode` state
- `setMode` action
- `simulate` references

Change:
- `ChatProvider` → `ProviderId | null` (null = not yet selected)
- Default `provider: null`

---

## 8. Simulate Mode Removal

Files deleted:
- `lib/ai/simulate.ts`
- `components/chat/SimulateModal.tsx`

Files modified:
- `ChatInput.tsx` — remove mode props, simulate button, simulate placeholder
- `ChatPanel.tsx` — remove `showSimulate`, `simulatePrompt`, `openSimulate`, `handleSimulateParsed`, SimulateModal render
- `chatStore.ts` — remove `mode`, `ChatMode`

---

## 9. New Dependencies

```bash
npm install @ai-sdk/openai @ai-sdk/google @ai-sdk/xai
```

---

## 10. Success Criteria

- [ ] Dropdown shows 5 providers; selecting one with no key shows inline key input
- [ ] Key saved to `byok_keys` column encrypted (base64), GET returns boolean presence
- [ ] Provider with saved key is immediately usable — no redirect to /settings
- [ ] Send button disabled if no provider selected or no key for active provider
- [ ] Simulate mode: zero references remain in codebase
- [ ] All 5 providers route correctly in `route.ts`
- [ ] `npx tsc --noEmit` passes
