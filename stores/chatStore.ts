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

export type ChatMode = 'api' | 'simulate'

export interface ChatState {
  pendingToolCalls: ToolCall[]
  ghostPreview: GhostPreview | null
  mode: ChatMode
  provider: ProviderId | null
  replyTo: ChatMessage | null
  attachedFile: { name: string; text: string } | null

  setPending: (toolCalls: ToolCall[], preview: GhostPreview) => void
  clearPending: () => void
  setMode: (mode: ChatMode) => void
  setProvider: (provider: ProviderId | null) => void
  setReplyTo: (msg: ChatMessage | null) => void
  setAttachedFile: (file: { name: string; text: string } | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  pendingToolCalls: [],
  ghostPreview: null,
  mode: 'api',
  provider: null,
  replyTo: null,
  attachedFile: null,

  setPending: (pendingToolCalls, ghostPreview) => set({ pendingToolCalls, ghostPreview }),
  clearPending: () => set({ pendingToolCalls: [], ghostPreview: null }),
  setMode: (mode) => set({ mode }),
  setProvider: (provider) => set({ provider }),
  setReplyTo: (replyTo) => set({ replyTo }),
  setAttachedFile: (attachedFile) => set({ attachedFile }),
  reset: () => set({ pendingToolCalls: [], ghostPreview: null, replyTo: null, attachedFile: null }),
}))
