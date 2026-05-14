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
    <div className="border border-violet-200 bg-violet-50 rounded-xl p-3 mb-3">
      <p className="text-sm font-medium text-violet-900 mb-2">{preview.description}</p>
      <ul className="text-xs text-violet-700 space-y-1 mb-3">
        {preview.changes.map((c, i) => <li key={i}>• {c}</li>)}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleCommit} disabled={committing} className="bg-violet-600 hover:bg-violet-700 text-white">
          {committing ? 'Đang thực hiện...' : 'Commit'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard} disabled={committing}>Discard</Button>
      </div>
    </div>
  )
}
