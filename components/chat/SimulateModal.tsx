'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { parseSimulateResponse } from '@/lib/ai/simulate'
import { buildGhostPreview } from '@/lib/ai/preview'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'
import { WRITE_TOOLS } from '@/lib/ai/constants'

interface Props {
  open: boolean
  prompt: string
  onClose: () => void
  onParsed: (toolCalls: ToolCall[], preview: GhostPreview, responseText: string) => void
}

export function SimulateModal({ open, prompt, onClose, onParsed }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [response, setResponse] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy prompt')
  const [parseWarning, setParseWarning] = useState('')

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt)
    setCopyLabel('Đã copy!')
    setTimeout(() => setCopyLabel('Copy prompt'), 2000)
  }

  function handleParse() {
    const allToolCalls = parseSimulateResponse(response)
    const toolCalls = allToolCalls.filter(tc => WRITE_TOOLS.has(tc.name))

    if (toolCalls.length === 0) {
      if (allToolCalls.length > 0) {
        setParseWarning(`AI chưa tạo sections/tasks (chỉ có: ${allToolCalls.map(t => t.name).join(', ')}). Hãy trả lời "Có, hãy tạo ngay" trong Claude.ai để AI tạo, rồi copy response đó về đây.`)
      } else {
        setParseWarning('Không tìm thấy tool calls nào. Hãy đảm bảo paste đúng response từ Claude.ai bao gồm block <tool_calls>.')
      }
      return
    }

    setParseWarning('')
    const preview = buildGhostPreview(toolCalls)
    const textPart = response.replace(/<tool_calls>[\s\S]*<\/tool_calls>/, '').trim()
    onParsed(toolCalls, preview, textPart || response)
    setStep(1)
    setResponse('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setStep(1) } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Simulate — {step === 1 ? 'Copy Prompt' : 'Paste Response'}</DialogTitle>
        </DialogHeader>
        {step === 1 ? (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <p className="text-sm text-muted-foreground">Copy prompt, paste vào <strong>Claude.ai</strong>, copy toàn bộ response rồi quay lại bước 2.</p>
            <Textarea value={prompt} readOnly className="flex-1 font-mono text-xs resize-none" rows={12} />
            <div className="flex gap-2">
              <Button onClick={handleCopy}>{copyLabel}</Button>
              <Button variant="outline" onClick={() => setStep(2)}>Tôi đã có response →</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <p className="text-sm text-muted-foreground">
              Paste toàn bộ response từ Claude.ai vào đây rồi nhấn Parse.{' '}
              <strong>Lưu ý:</strong> nếu AI hỏi xác nhận (ví dụ &quot;Bạn có muốn tạo không?&quot;), hãy trả lời &quot;Có&quot; trong Claude.ai để AI tạo sections/tasks, rồi copy response đó về đây.
            </p>
            <Textarea value={response} onChange={e => { setResponse(e.target.value); setParseWarning('') }} placeholder="Paste response..." className="flex-1 text-sm resize-none" rows={12} />
            {parseWarning && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{parseWarning}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleParse} disabled={!response.trim()}>Parse &amp; Preview</Button>
              <Button variant="outline" onClick={() => setStep(1)}>← Quay lại</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
