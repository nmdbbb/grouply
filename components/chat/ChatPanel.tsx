'use client'
import { useRef, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { Message } from './Message'
import { ActionPreviewCard } from './ActionPreviewCard'
import { SimulateModal } from './SimulateModal'
import { FileAttachButton } from './FileAttachButton'
import { ReplyBar } from './ReplyBar'
import { buildSimulatePrompt } from '@/lib/ai/simulate'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ProjectContext } from '@/lib/ai/context'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'
import { getMessageText } from '@/lib/chat/messageUtils'

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
  const bottomRef = useRef<HTMLDivElement>(null)

  const {
    pendingToolCalls, ghostPreview, mode, provider,
    replyTo, attachedFile,
    setPending, clearPending, setMode, setProvider, setReplyTo, setAttachedFile,
  } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: {
        project_id: projectId,
        provider,
        reply_to: replyTo?.content ?? null,
        attached_text: attachedFile?.text ?? null,
      },
    }),
    onData: (dataPart: any) => {
      if (dataPart?.name === 'write-tools' && dataPart?.data) {
        const { tool_calls, preview } = dataPart.data as { tool_calls: ToolCall[]; preview: GhostPreview }
        setPending(tool_calls, preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(tool_calls, context)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    },
    onFinish: () => {
      setReplyTo(null)
      setAttachedFile(null)
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function submitMessage() {
    if (!input.trim()) return
    sendMessage({ text: input })
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (mode === 'simulate') {
        const history = messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: getMessageText(m),
        }))
        const prompt = buildSimulatePrompt(context, history, input, currentUserName, currentUserRole, userId)
        setSimulatePrompt(prompt)
        setShowSimulate(true)
        setInput('')
        return
      }
      submitMessage()
    }
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
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">AI Chat</span>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
            <button
              title="Anthropic Claude"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${provider === 'anthropic' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setProvider('anthropic')}
            >
              Claude
            </button>
            <button
              title="Groq (Llama 3.3 70B)"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${provider === 'groq' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setProvider('groq')}
            >
              Groq
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            className={`text-xs px-2 py-1 rounded-md ${mode === 'api' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
            onClick={() => setMode('api')}
          >
            🤖 API
          </button>
          <button
            className={`text-xs px-2 py-1 rounded-md ${mode === 'simulate' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
            onClick={() => setMode('simulate')}
          >
            📋 Simulate
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Hỏi AI về project, phân công task, hoặc paste đề bài để bắt đầu.
          </p>
        )}

        {messages.map(m => {
          const text = getMessageText(m)
          if (!text) return null
          return (
            <Message
              key={m.id}
              message={{ id: m.id, role: m.role as 'user' | 'assistant', content: text, timestamp: new Date() }}
              onReply={setReplyTo}
            />
          )
        })}

        {ghostPreview && pendingToolCalls.length > 0 && (
          <ActionPreviewCard
            preview={ghostPreview}
            toolCalls={pendingToolCalls}
            projectId={projectId}
            onCommit={() => { clearPending(); clearGhost(); onAfterCommit?.() }}
            onDiscard={() => { clearPending(); clearGhost() }}
          />
        )}

        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-muted-foreground">
              Đang suy nghĩ...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {replyTo && <ReplyBar message={replyTo} onClear={() => setReplyTo(null)} />}

      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-xs">
          <span className="text-amber-700 flex-1 truncate">📎 {attachedFile.name}</span>
          <button onClick={() => setAttachedFile(null)} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2 items-end">
          <FileAttachButton onExtracted={setAttachedFile} />
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'simulate' ? 'Nhập câu hỏi → xuất prompt...' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button
            size="sm"
            onClick={() => {
              if (mode === 'simulate') {
                const history = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: getMessageText(m) }))
                const prompt = buildSimulatePrompt(context, history, input, currentUserName, currentUserRole, userId)
                setSimulatePrompt(prompt)
                setShowSimulate(true)
                setInput('')
                return
              }
              submitMessage()
            }}
            disabled={isLoading || !input.trim()}
            className="self-end shrink-0"
          >
            Gửi
          </Button>
        </div>
      </div>

      <SimulateModal
        open={showSimulate}
        prompt={simulatePrompt}
        onClose={() => setShowSimulate(false)}
        onParsed={handleSimulateParsed}
      />
    </div>
  )
}
