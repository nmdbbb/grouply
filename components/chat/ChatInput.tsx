// components/chat/ChatInput.tsx
'use client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FileAttachButton } from './FileAttachButton'
import { ReplyBar } from './ReplyBar'
import { ProviderDropdown } from './ProviderDropdown'
import type { ProviderId } from '@/lib/ai/providers'
import type { ChatMode } from '@/stores/chatStore'

interface Props {
  input: string
  mode: ChatMode
  provider: ProviderId | null
  isLoading: boolean
  replyTo: any | null
  attachedFile: { name: string; text: string } | null
  onInputChange: (val: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onSimulateClick: () => void
  onClearReply: () => void
  onClearFile: () => void
  onSetFile: (file: { name: string; text: string }) => void
  onSetProvider: (p: ProviderId) => void
  onSetMode: (m: ChatMode) => void
}

export function ChatInput({
  input, mode, provider, isLoading,
  replyTo, attachedFile,
  onInputChange, onKeyDown, onSend, onSimulateClick,
  onClearReply, onClearFile, onSetFile, onSetProvider, onSetMode,
}: Props) {
  const isSimulate = mode === 'simulate'
  // In API mode a provider is required; in Simulate mode the user pastes a Claude.ai
  // response so no provider/key is needed.
  const sendDisabled = isLoading || !input.trim() || (!isSimulate && !provider)

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 gap-2">
        <span className="text-sm font-medium shrink-0">AI Chat</span>
        <ProviderDropdown provider={provider} mode={mode} onSelect={onSetProvider} onSetMode={onSetMode} />
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
            placeholder={isSimulate ? 'Nhập tin nhắn... (Enter để tạo prompt)' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button
            size="sm"
            onClick={isSimulate ? onSimulateClick : onSend}
            disabled={sendDisabled}
            className="self-end shrink-0"
          >{isSimulate ? 'Tạo prompt' : 'Gửi'}</Button>
        </div>
        {isSimulate ? (
          <p className="text-xs text-muted-foreground mt-1.5 text-center">Simulate: copy prompt sang Claude.ai, dán response về — không cần API key.</p>
        ) : !provider ? (
          <p className="text-xs text-muted-foreground mt-1.5 text-center">Chọn AI provider để bắt đầu</p>
        ) : null}
      </div>
    </>
  )
}
