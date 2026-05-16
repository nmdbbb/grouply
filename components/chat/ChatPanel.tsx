'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
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
import type { ChatMessage, ToolCall, GhostPreview } from '@/stores/chatStore'

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
  const [showSimulate, setShowSimulate] = useState(false)
  const [simulatePrompt, setSimulatePrompt] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const {
    messages, pendingToolCalls, ghostPreview, mode, loading, streamingContent,
    replyTo, attachedFile,
    addMessage, updateStreamingContent, flushStreaming,
    setLoading, setPending, clearPending, setMode, setReplyTo, setAttachedFile,
  } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingContent])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    addMessage({
      role: 'user',
      content: text,
      replyTo: replyTo?.content,
      attachmentName: attachedFile?.name,
    })

    const capturedReplyTo = replyTo?.content ?? null
    const capturedFile = attachedFile ?? null
    setReplyTo(null)
    setAttachedFile(null)
    setLoading(true)

    try {
      if (mode === 'simulate') {
        const history = messages.map(m => ({ role: m.role, content: m.content }))
        const prompt = buildSimulatePrompt(context, history, text, currentUserName, currentUserRole, userId)
        setSimulatePrompt(prompt)
        setShowSimulate(true)
        setLoading(false)
        return
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          message: text,
          conversation_history: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
          reply_to: capturedReplyTo,
          attached_text: capturedFile?.text ?? null,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'text_delta') {
              updateStreamingContent(event.text)
            } else if (event.type === 'write_tools') {
              flushStreaming()
              const writeCalls = event.tool_calls as ToolCall[]
              const preview = event.preview as GhostPreview
              setPending(writeCalls, preview)
              const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(writeCalls, context)
              setGhostPreview(ghostNodes, ghostEdges)
            } else if (event.type === 'done') {
              flushStreaming()
            } else if (event.type === 'error') {
              flushStreaming()
              addMessage({ role: 'assistant', content: `Lỗi: ${event.message}` })
            }
          } catch {
            // malformed JSON line — skip
          }
        }
      }
    } catch {
      flushStreaming()
      addMessage({ role: 'assistant', content: 'Xin lỗi, có lỗi xảy ra. Thử lại nhé.' })
    }
    setLoading(false)
  }, [
    input, loading, mode, messages, projectId, context,
    currentUserName, currentUserRole, userId,
    replyTo, attachedFile,
    addMessage, updateStreamingContent, flushStreaming,
    setLoading, setPending, setGhostPreview, setReplyTo, setAttachedFile,
  ])

  function handleSimulateParsed(toolCalls: ToolCall[], preview: GhostPreview, responseText: string) {
    if (responseText) addMessage({ role: 'assistant', content: responseText })
    if (toolCalls.length > 0) {
      setPending(toolCalls, preview)
      const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(toolCalls, context)
      setGhostPreview(ghostNodes, ghostEdges)
    }
  }

  return (
    <div className="flex flex-col h-full border-l bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">AI Chat</span>
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
        {messages.length === 0 && !streamingContent && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Hỏi AI về project, phân công task, hoặc paste đề bài để bắt đầu.
          </p>
        )}

        {messages.map(m => (
          <Message
            key={m.id}
            message={m}
            onReply={setReplyTo}
          />
        ))}

        {streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[85%] bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
              {streamingContent}
              <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {ghostPreview && pendingToolCalls.length > 0 && (
          <ActionPreviewCard
            preview={ghostPreview}
            toolCalls={pendingToolCalls}
            projectId={projectId}
            onCommit={() => { clearPending(); clearGhost(); onAfterCommit?.() }}
            onDiscard={() => { clearPending(); clearGhost() }}
          />
        )}

        {loading && !streamingContent && (
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
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={mode === 'simulate' ? 'Nhập câu hỏi → xuất prompt...' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm flex-1"
            rows={2}
          />
          <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()} className="self-end shrink-0">
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
