'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { GhostPreview, ToolCall } from '@/stores/chatStore'

interface Props {
  preview: GhostPreview
  toolCalls: ToolCall[]
  projectId: string
  onCommit: () => void
  onDiscard: () => void
}

export function ActionPreviewCard({ preview, toolCalls, projectId, onCommit, onDiscard }: Props) {
  const [committing, setCommitting] = useState(false)

  async function handleCommit() {
    setCommitting(true)
    await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, commit_tool_calls: toolCalls }),
    })
    onCommit()
    toast.success('Đã thực hiện thay đổi', { description: `${toolCalls.length} thay đổi đã được áp dụng.` })
    setCommitting(false)
  }

  return (
    <div
      className="rounded-xl p-3 animate-in slide-in-from-bottom-2 fade-in duration-200"
      style={{
        border: '1.5px solid #5B5BD6',
        background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
        boxShadow: '0 0 0 3px rgba(91,91,214,0.08), 0 4px 20px rgba(91,91,214,0.10)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">
          AI đề xuất · {toolCalls.length} thay đổi
        </span>
      </div>

      <p className="text-sm font-semibold text-indigo-950 mb-1.5 leading-snug">{preview.description}</p>

      <ul className="space-y-0.5 mb-3">
        {preview.changes.map((c, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-indigo-700">
            <span className="text-indigo-400 mt-px leading-none">→</span>
            <span className="leading-snug">{c}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleCommit}
          disabled={committing}
          className="h-7 px-3 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white border-0"
        >
          {committing ? 'Đang áp dụng...' : 'Áp dụng'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDiscard}
          disabled={committing}
          className="h-7 px-3 text-xs font-medium border-indigo-200 text-indigo-600 hover:bg-indigo-50"
        >
          Bỏ qua
        </Button>
      </div>
    </div>
  )
}
