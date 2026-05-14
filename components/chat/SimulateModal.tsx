'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { parseSimulateResponse } from '@/lib/ai/simulate'
import { buildGhostPreview } from '@/lib/ai/execute'
import type { ToolCall, GhostPreview } from '@/stores/chatStore'

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

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt)
    setCopyLabel('Đã copy!')
    setTimeout(() => setCopyLabel('Copy prompt'), 2000)
  }

  function handleParse() {
    const toolCalls = parseSimulateResponse(response)
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
            <p className="text-sm text-muted-foreground">Paste toàn bộ response từ Claude.ai vào đây rồi nhấn Parse.</p>
            <Textarea value={response} onChange={e => setResponse(e.target.value)} placeholder="Paste response..." className="flex-1 text-sm resize-none" rows={12} />
            <div className="flex gap-2">
              <Button onClick={handleParse} disabled={!response.trim()}>Parse & Preview</Button>
              <Button variant="outline" onClick={() => setStep(1)}>← Quay lại</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
