'use client'
import { useRef, useEffect } from 'react'
import { Message } from './Message'
import { ActionPreviewCard } from './ActionPreviewCard'
import { getMessageText } from '@/lib/chat/messageUtils'
import type { GhostPreview, ToolCall } from '@/stores/chatStore'

interface Props {
  messages: any[]
  isLoading: boolean
  ghostPreview: GhostPreview | null
  pendingToolCalls: ToolCall[]
  projectId: string
  onSetReplyTo: (msg: any) => void
  onCommit: () => void
  onDiscard: () => void
}

export function ChatMessages({
  messages, isLoading, ghostPreview, pendingToolCalls,
  projectId, onSetReplyTo, onCommit, onDiscard,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {messages.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground text-center mt-8">
          Hỏi AI về project, phân công task, hoặc paste đề bài để bắt đầu.
        </p>
      )}

      {messages.map((m: any) => {
        if (m.role === 'assistant') console.log('[msg]', m.id, JSON.stringify(m).slice(0, 500))
        const text = getMessageText(m)
        if (!text) return null
        return (
          <Message
            key={m.id}
            message={{ id: m.id, role: m.role as 'user' | 'assistant', content: text, timestamp: new Date() }}
            onReply={onSetReplyTo}
          />
        )
      })}

      {ghostPreview && pendingToolCalls.length > 0 && (
        <ActionPreviewCard
          preview={ghostPreview}
          toolCalls={pendingToolCalls}
          projectId={projectId}
          onCommit={onCommit}
          onDiscard={onDiscard}
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
  )
}
