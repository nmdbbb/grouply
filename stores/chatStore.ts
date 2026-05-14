import { create } from 'zustand'

export type ChatMode = 'api' | 'simulate'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
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
  messages: ChatMessage[]
  pendingToolCalls: ToolCall[]
  ghostPreview: GhostPreview | null
  mode: ChatMode
  loading: boolean

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearPending: () => void
  setMode: (mode: ChatMode) => void
  setLoading: (v: boolean) => void
  setPending: (toolCalls: ToolCall[], preview: GhostPreview) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  pendingToolCalls: [],
  ghostPreview: null,
  mode: 'api',
  loading: false,

  addMessage: (msg) => set(state => ({
    messages: [...state.messages, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }],
  })),

  clearPending: () => set({ pendingToolCalls: [], ghostPreview: null }),
  setMode: (mode) => set({ mode }),
  setLoading: (loading) => set({ loading }),
  setPending: (pendingToolCalls, ghostPreview) => set({ pendingToolCalls, ghostPreview }),
  reset: () => set({ messages: [], pendingToolCalls: [], ghostPreview: null }),
}))
