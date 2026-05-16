'use client'
import { X } from 'lucide-react'
import type { ChatMessage } from '@/stores/chatStore'

interface Props {
  message: ChatMessage
  onClear: () => void
}

export function ReplyBar({ message, onClear }: Props) {
  const preview = message.content.slice(0, 80) + (message.content.length > 80 ? '…' : '')
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border-t border-blue-100 text-xs">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-blue-700">
          {message.role === 'user' ? 'Bạn' : 'AI'}
        </span>
        <p className="text-gray-500 truncate mt-0.5">{preview}</p>
      </div>
      <button onClick={onClear} className="shrink-0 text-gray-400 hover:text-gray-600 mt-0.5">
        <X size={14} />
      </button>
    </div>
  )
}
