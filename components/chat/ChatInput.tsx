// components/chat/ChatInput.tsx
'use client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FileAttachButton } from './FileAttachButton'
import { ReplyBar } from './ReplyBar'
import { ProviderDropdown } from './ProviderDropdown'
import type { ProviderId } from '@/lib/ai/providers'

interface Props {
  input: string
  provider: ProviderId | null
  isLoading: boolean
  replyTo: any | null
  attachedFile: { name: string; text: string } | null
  onInputChange: (val: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onClearReply: () => void
  onClearFile: () => void
  onSetFile: (file: { name: string; text: string }) => void
  onSetProvider: (p: ProviderId) => void
}

export function ChatInput({
  input, provider, isLoading,
  replyTo, attachedFile,
  onInputChange, onKeyDown, onSend,
  onClearReply, onClearFile, onSetFile, onSetProvider,
}: Props) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">AI Chat</span>
        <ProviderDropdown provider={provider} onSelect={onSetProvider} />
      </div>

      {/* Reply and file banners */}
      {replyTo && <ReplyBar message={replyTo} onClear={onClearReply} />}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-xs">
          <span className="text-amber-700 flex-1 truncate">📎 {attachedFile.name}</span>
          <button onClick={onClearFile} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Input row */}
      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2 items-end">
          <FileAttachButton onExtracted={onSetFile} />
          <Textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nhập tin nhắn... (Enter để gửi)"
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button
            size="sm"
            onClick={onSend}
            disabled={isLoading || !input.trim() || !provider}
            className="self-end shrink-0"
          >Gửi</Button>
        </div>
        {!provider && (
          <p className="text-xs text-muted-foreground mt-1.5 text-center">Chọn AI provider để bắt đầu</p>
        )}
      </div>
    </>
  )
}
