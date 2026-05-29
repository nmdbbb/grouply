import { WRITE_TOOLS } from '@/lib/ai/constants'

export function getMessageText(msg: any): string {
  // Check content string first (Groq returns text here)
  if (typeof msg.content === 'string' && msg.content) return msg.content
  // Then check parts array (AI SDK v6 streaming format)
  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    const text = msg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text ?? '').join('')
    if (text) return text
  }
  // Content as array (some providers)
  if (Array.isArray(msg.content)) {
    return msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text ?? '').join('')
  }
  return ''
}

export function isWriteToolCall(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
}
