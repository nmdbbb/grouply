'use client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FileAttachButton } from './FileAttachButton'
import { ReplyBar } from './ReplyBar'

interface Props {
  input: string
  mode: 'api' | 'simulate'
  provider: 'anthropic' | 'groq'
  isLoading: boolean
  replyTo: any | null
  attachedFile: { name: string; text: string } | null
  onInputChange: (val: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onClearReply: () => void
  onClearFile: () => void
  onSetFile: (file: { name: string; text: string }) => void
  onSetProvider: (p: 'anthropic' | 'groq') => void
  onSetMode: (m: 'api' | 'simulate') => void
  onSimulateClick: () => void
}

export function ChatInput({
  input, mode, provider, isLoading,
  replyTo, attachedFile,
  onInputChange, onKeyDown, onSend,
  onClearReply, onClearFile, onSetFile,
  onSetProvider, onSetMode, onSimulateClick,
}: Props) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">AI Chat</span>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
            <button
              title="Anthropic Claude"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${provider === 'anthropic' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => onSetProvider('anthropic')}
            >Claude</button>
            <button
              title="Groq (Llama 3.3 70B)"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${provider === 'groq' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => onSetProvider('groq')}
            >Groq</button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            className={`text-xs px-2 py-1 rounded-md ${mode === 'api' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
            onClick={() => onSetMode('api')}
          >🤖 API</button>
          <button
            className={`text-xs px-2 py-1 rounded-md ${mode === 'simulate' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
            onClick={() => onSetMode('simulate')}
          >📋 Simulate</button>
        </div>
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
            placeholder={mode === 'simulate' ? 'Nhập câu hỏi → xuất prompt...' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button
            size="sm"
            onClick={mode === 'simulate' ? onSimulateClick : onSend}
            disabled={isLoading || !input.trim()}
            className="self-end shrink-0"
          >Gửi</Button>
        </div>
      </div>
    </>
  )
}
