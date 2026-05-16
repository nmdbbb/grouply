import { create } from 'zustand'

export type ChatMode = 'api' | 'simulate'
export type ChatProvider = 'anthropic' | 'groq'

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
  messages: ChatMessage[]
  pendingToolCalls: ToolCall[]
  ghostPreview: GhostPreview | null
  mode: ChatMode
  provider: ChatProvider
  loading: boolean
  streamingContent: string
  replyTo: ChatMessage | null
  attachedFile: { name: string; text: string } | null

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateStreamingContent: (delta: string) => void
  flushStreaming: () => void
  clearPending: () => void
  setMode: (mode: ChatMode) => void
  setProvider: (provider: ChatProvider) => void
  setLoading: (v: boolean) => void
  setPending: (toolCalls: ToolCall[], preview: GhostPreview) => void
  setReplyTo: (msg: ChatMessage | null) => void
  setAttachedFile: (file: { name: string; text: string } | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  pendingToolCalls: [],
  ghostPreview: null,
  mode: 'api',
  provider: 'anthropic',
  loading: false,
  streamingContent: '',
  replyTo: null,
  attachedFile: null,

  addMessage: (msg) => set(state => ({
    messages: [...state.messages, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }],
  })),

  updateStreamingContent: (delta) => set(state => ({
    streamingContent: state.streamingContent + delta,
  })),

  flushStreaming: () => {
    const { streamingContent, messages } = get()
    if (!streamingContent) return
    set({
      messages: [...messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date(),
      }],
      streamingContent: '',
    })
  },

  clearPending: () => set({ pendingToolCalls: [], ghostPreview: null }),
  setMode: (mode) => set({ mode }),
  setProvider: (provider) => set({ provider }),
  setLoading: (loading) => set({ loading }),
  setPending: (pendingToolCalls, ghostPreview) => set({ pendingToolCalls, ghostPreview }),
  setReplyTo: (replyTo) => set({ replyTo }),
  setAttachedFile: (attachedFile) => set({ attachedFile }),
  reset: () => set({ messages: [], pendingToolCalls: [], ghostPreview: null, streamingContent: '', replyTo: null, attachedFile: null }),
}))
