'use client'
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { SimulateModal } from './SimulateModal'
import { buildSimulatePrompt } from '@/lib/ai/simulate'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
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
  const [showSimulate, setShowSimulate] = useState(false)
  const [simulatePrompt, setSimulatePrompt] = useState('')
  const [input, setInput] = useState('')

  const {
    pendingToolCalls, ghostPreview, mode, provider,
    replyTo, attachedFile,
    setPending, clearPending, setMode, setProvider, setReplyTo, setAttachedFile,
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
    if (!input.trim()) return
    sendMessage({ text: input })
    setInput('')
  }

  function openSimulate() {
    const history = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: getMessageText(m) }))
    setSimulatePrompt(buildSimulatePrompt(context, history, input, currentUserName, currentUserRole, userId))
    setShowSimulate(true)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (mode === 'simulate') { openSimulate(); return }
    submitMessage()
  }

  function handleSimulateParsed(toolCalls: ToolCall[], preview: GhostPreview) {
    if (toolCalls.length > 0) {
      setPending(toolCalls, preview)
      const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(toolCalls, context)
      setGhostPreview(ghostNodes, ghostEdges)
    }
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
        onClearReply={() => setReplyTo(null)}
        onClearFile={() => setAttachedFile(null)}
        onSetFile={setAttachedFile}
        onSetProvider={setProvider}
        onSetMode={setMode}
        onSimulateClick={openSimulate}
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
