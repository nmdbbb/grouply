'use client'
import { useRef, useEffect } from 'react'
import { Message } from './Message'
import { getMessageText } from '@/lib/chat/messageUtils'

interface Props {
  messages: any[]
  isLoading: boolean
  projectId: string
  onSetReplyTo: (msg: any) => void
}

export function ChatMessages({ messages, isLoading, projectId, onSetReplyTo }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col">
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2.5 py-10 text-center">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base font-bold"
            style={{ background: 'linear-gradient(135deg, #5B5BD6, #7C3AED)' }}
          >
            ✦
          </div>
          <p className="text-sm font-medium text-gray-700">Chào mừng đến Grouply</p>
          <p className="text-xs text-muted-foreground max-w-[190px] leading-relaxed">
            Hỏi AI để lên kế hoạch, phân công task, hoặc phân tích đề bài.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {messages.map((m: any) => {
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
      </div>

      {isLoading && (
        <div className="flex justify-start mt-2">
          <div className="flex items-center gap-1.5 bg-white border border-border rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:120ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:240ms]" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
