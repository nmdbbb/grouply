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
