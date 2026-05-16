import type { ChatMessage } from '@/stores/chatStore'

interface Props {
  message: ChatMessage
  onReply?: (msg: ChatMessage) => void
}

export function Message({ message, onReply }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 group`}>
      <div className="max-w-[85%]">
        {message.replyTo && (
          <div className={`text-xs px-2.5 py-1.5 mb-1 rounded-lg border-l-2 ${
            isUser
              ? 'bg-blue-700 border-blue-300 text-blue-100'
              : 'bg-gray-200 border-gray-400 text-gray-500'
          }`}>
            {message.replyTo.slice(0, 80)}{message.replyTo.length > 80 ? '…' : ''}
          </div>
        )}

        <div className={`relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}>
          {message.attachmentName && (
            <div className={`text-xs mb-1.5 flex items-center gap-1 ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
              📎 {message.attachmentName}
            </div>
          )}
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>

        {onReply && (
          <div className={`flex mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : 'justify-start'}`}>
            <button
              onClick={() => onReply(message)}
              className="text-xs text-gray-400 hover:text-gray-600 px-1"
            >
              Trả lời
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
