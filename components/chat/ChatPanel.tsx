// components/chat/ChatPanel.tsx
'use client'
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { toast } from 'sonner'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { SimulateModal } from './SimulateModal'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import { buildSimulatePrompt } from '@/lib/ai/simulate'
import { getMessageText } from '@/lib/chat/messageUtils'
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
  const [showSimulate, setShowSimulate] = useState(false)
  const [simulatePrompt, setSimulatePrompt] = useState('')

  const {
    pendingToolCalls, ghostPreview, mode, provider,
    replyTo, attachedFile,
    setPending, clearPending, setMode, setProvider, setReplyTo, setAttachedFile,
  } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { project_id: projectId },
    }),
    onData: (dataPart: any) => {
      if (dataPart?.type === 'data-write-tools' && dataPart?.data) {
        const { tool_calls, preview } = dataPart.data as { tool_calls: ToolCall[]; preview: GhostPreview }
        setPending(tool_calls, preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(tool_calls, context)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    },
    onFinish: () => { setReplyTo(null); setAttachedFile(null) },
    onError: (err) => {
      console.error('[chat] error:', err)
      toast.error(err.message || 'Không gửi được tin nhắn. Kiểm tra provider và API key.')
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  function submitMessage() {
    if (!input.trim() || !provider) return
    sendMessage({ text: input }, {
      body: { project_id: projectId, provider, reply_to: replyTo?.content ?? null, attached_text: attachedFile?.text ?? null },
    })
    setInput('')
  }

  function openSimulate() {
    if (!input.trim()) return
    const history = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: getMessageText(m) }))
    setSimulatePrompt(buildSimulatePrompt(context, history, input, currentUserName, currentUserRole, userId))
    setShowSimulate(true)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (mode === 'simulate') openSimulate()
    else submitMessage()
  }

  function handleSimulateParsed(toolCalls: ToolCall[], preview: GhostPreview) {
    if (toolCalls.length === 0) return
    setPending(toolCalls, preview)
    const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(toolCalls, context)
    setGhostPreview(ghostNodes, ghostEdges)
  }

  return (
    <div className="flex flex-col h-full border-l bg-white">
      <ChatInput
        input={input}
        mode={mode}
        provider={provider}
        isLoading={isLoading}
        replyTo={replyTo}
        attachedFile={attachedFile}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={submitMessage}
        onSimulateClick={openSimulate}
        onClearReply={() => setReplyTo(null)}
        onClearFile={() => setAttachedFile(null)}
        onSetFile={setAttachedFile}
        onSetProvider={setProvider}
        onSetMode={setMode}
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
      <SimulateModal
        open={showSimulate}
        prompt={simulatePrompt}
        onClose={() => setShowSimulate(false)}
        onParsed={handleSimulateParsed}
      />
    </div>
  )
}
