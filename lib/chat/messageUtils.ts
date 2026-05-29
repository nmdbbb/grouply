import { WRITE_TOOLS } from '@/lib/ai/constants'

export function getMessageText(msg: any): string {
  // parts array takes priority (AI SDK v6 streaming format)
  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    const text = msg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text ?? '').join('')
    if (text) return text
  }
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text ?? '').join('')
  }
  return ''
}

export function isWriteToolCall(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
}
