import { WRITE_TOOLS } from '@/lib/ai/constants'

export function getMessageText(msg: any): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.parts)) {
    return msg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
  }
  return ''
}

export function isWriteToolCall(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
}
