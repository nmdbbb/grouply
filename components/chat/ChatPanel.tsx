'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useGraphStore } from '@/stores/graphStore'
import { Message } from './Message'
import { ActionPreviewCard } from './ActionPreviewCard'
import { SimulateModal } from './SimulateModal'
import { buildSimulatePrompt } from '@/lib/ai/simulate'
import { buildGhostNodesFromToolCalls } from '@/lib/ai/ghostBuilder'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
  const [input, setInput] = useState('')
  const [showSimulate, setShowSimulate] = useState(false)
  const [simulatePrompt, setSimulatePrompt] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, pendingToolCalls, ghostPreview, mode, loading, addMessage, setLoading, setPending, clearPending, setMode } = useChatStore()
  const { setGhostPreview, clearGhost } = useGraphStore()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    addMessage({ role: 'user', content: text })
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
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()

      if (data.text) addMessage({ role: 'assistant', content: data.text })

      if (data.tool_calls?.length > 0 && data.preview) {
        setPending(data.tool_calls, data.preview)
        const { ghostNodes, ghostEdges } = buildGhostNodesFromToolCalls(data.tool_calls, context)
        setGhostPreview(ghostNodes, ghostEdges)
      }
    } catch {
      addMessage({ role: 'assistant', content: 'Xin lỗi, có lỗi xảy ra. Thử lại nhé.' })
    }
    setLoading(false)
  }, [input, loading, mode, messages, projectId, context, currentUserName, currentUserRole, userId, addMessage, setLoading, setPending, setGhostPreview])

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
          <button className={`text-xs px-2 py-1 rounded-md ${mode === 'api' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`} onClick={() => setMode('api')}>🤖 API</button>
          <button className={`text-xs px-2 py-1 rounded-md ${mode === 'simulate' ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`} onClick={() => setMode('simulate')}>📋 Simulate</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">Hỏi AI về project, phân công task, hoặc paste đề bài để bắt đầu.</p>
        )}
        {messages.map(m => <Message key={m.id} message={m} />)}

        {ghostPreview && pendingToolCalls.length > 0 && (
          <ActionPreviewCard
            preview={ghostPreview}
            toolCalls={pendingToolCalls}
            projectId={projectId}
            onCommit={() => { clearPending(); clearGhost(); onAfterCommit?.() }}
            onDiscard={() => { clearPending(); clearGhost() }}
          />
        )}

        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-muted-foreground">Đang suy nghĩ...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={mode === 'simulate' ? 'Nhập câu hỏi → xuất prompt...' : 'Nhập tin nhắn... (Enter để gửi)'}
            className="resize-none text-sm"
            rows={2}
          />
          <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()} className="self-end">Gửi</Button>
        </div>
      </div>

      <SimulateModal open={showSimulate} prompt={simulatePrompt} onClose={() => setShowSimulate(false)} onParsed={handleSimulateParsed} />
    </div>
  )
}
