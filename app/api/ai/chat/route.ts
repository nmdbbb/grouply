import { NextRequest } from 'next/server'
import { streamText, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, convertToModelMessages } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { buildProjectContext } from '@/lib/ai/context'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { buildTools, WRITE_TOOLS, executeToolCalls } from '@/lib/ai/tools'
import { buildGhostPreview } from '@/lib/ai/preview'
import { indexActivity } from '@/lib/ai/activity-log'
import type { ToolCall } from '@/stores/chatStore'
import { PROVIDERS, getModelInstance } from '@/lib/ai/providers'
import type { ProviderId } from '@/lib/ai/providers'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const {
    project_id, messages: clientMessages = [],
    commit_tool_calls, attached_text, reply_to,
    provider,
  } = body

  // --- Commit path ---
  if (commit_tool_calls && Array.isArray(commit_tool_calls)) {
    const toolCalls = commit_tool_calls as ToolCall[]
    const results = await executeToolCalls(toolCalls, project_id, user.id, supabase)

    const context = await buildProjectContext(project_id)
    const memberNames = Object.fromEntries(context.members.map(m => [m.id, m.name]))
    const taskNames = Object.fromEntries(context.tasks.map(t => [t.id, t.name]))
    indexActivity(
      project_id,
      toolCalls.map(tc => ({ name: tc.name, input: tc.input })),
      { memberNames, taskNames },
      supabase
    ).catch(err => console.error('indexActivity failed:', err))

    return Response.json({ executed: true, results })
  }

  const { data: profile } = await supabase.from('profiles').select('name, byok_keys').eq('id', user.id).single()
  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).single()
  if (!membership) return new Response('Forbidden', { status: 403 })

  if (!provider || !(provider in PROVIDERS)) {
    return new Response('Provider not specified or invalid', { status: 400 })
  }

  const byokKeys = (profile?.byok_keys ?? {}) as Record<string, string>
  const providerId = provider as ProviderId
  const rawKey = byokKeys[providerId]
    ? Buffer.from(byokKeys[providerId], 'base64').toString('utf-8')
    : process.env[PROVIDERS[providerId].envKey] ?? ''

  console.log('[chat] provider:', providerId, 'hasKey:', Boolean(rawKey))

  if (!rawKey) return new Response(`No API key configured for provider: ${providerId}`, { status: 400 })

  let model: ReturnType<typeof getModelInstance>
  try {
    model = getModelInstance(providerId, rawKey)
  } catch (err) {
    console.error('[chat] getModelInstance failed:', err)
    return new Response('Failed to initialize AI model', { status: 500 })
  }

  const context = await buildProjectContext(project_id)
  const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id, provider === 'groq' ? 'groq' : undefined)

  // Build model messages from UI message history + inject context into last user message
  const uiMessages = clientMessages as any[]
  const lastUserIdx = [...uiMessages].reverse().findIndex(m => m.role === 'user')
  if (lastUserIdx >= 0) {
    const idx = uiMessages.length - 1 - lastUserIdx
    const lastUser = uiMessages[idx]
    let text = typeof lastUser.content === 'string'
      ? lastUser.content
      : (lastUser.parts?.find((p: any) => p.type === 'text')?.text ?? '')
    if (reply_to) text = `[Trả lời: "${reply_to}"]\n\n${text}`
    if (attached_text) text += `\n\n---\n[NỘI DUNG FILE ĐÍNH KÈM]\n${attached_text}`
    // Patch in place
    uiMessages[idx] = {
      ...lastUser,
      content: typeof lastUser.content === 'string' ? text : lastUser.content,
      parts: lastUser.parts
        ? lastUser.parts.map((p: any) => p.type === 'text' ? { ...p, text } : p)
        : undefined,
    }
  }

  let aiMessages: { role: 'user' | 'assistant'; content: string }[]
  try {
    aiMessages = await convertToModelMessages(uiMessages.slice(-12)) as any
  } catch {
    aiMessages = uiMessages.slice(-12).filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : (m.parts?.find((p: any) => p.type === 'text')?.text ?? ''),
    }))
  }

  const tools = buildTools(project_id, user.id, supabase)

  if (!rawKey) {
    return Response.json({ error: 'API key chưa được cấu hình cho provider này.' }, { status: 400 })
  }

  const stream = createUIMessageStream({
    onError: (error) => {
      const err = error as any
      // Provider errors (e.g. Groq APICallError) carry `failed_generation` — the raw
      // model output that failed tool-call validation. It may live on responseBody,
      // data, cause, or only inside the stringified error. Search exhaustively.
      const candidates = [
        err?.responseBody, err?.data, err?.cause?.responseBody, err?.cause?.data,
        err?.responseBody ?? err?.message,
      ].filter(Boolean)
      let dump = ''
      try { dump = JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})) } catch { dump = String(err) }
      console.error('[chat] stream error FULL:', dump)
      console.error('[chat] stream error name:', err?.name, '| message:', err?.message)
      // Persist full error to a file so it can be inspected without scrolling the terminal.
      try {
        const fsmod = require('node:fs') as typeof import('node:fs')
        fsmod.mkdirSync('.cache', { recursive: true })
        fsmod.writeFileSync('.cache/groq-error.json', JSON.stringify({
          at: new Date().toISOString(),
          name: err?.name, message: err?.message,
          responseBody: err?.responseBody, data: err?.data,
          cause: err?.cause ? JSON.stringify(err.cause, Object.getOwnPropertyNames(err.cause)) : undefined,
          full: dump,
          messagesSent: aiMessages,
        }, null, 2))
      } catch (e) { console.error('[chat] could not write error file:', e) }

      const extractFailed = (raw: unknown): string | null => {
        if (!raw) return null
        const tryParse = (s: string) => { try { return JSON.parse(s) } catch { return null } }
        const obj = typeof raw === 'string' ? tryParse(raw) : raw
        const fg = (obj as any)?.error?.failed_generation ?? (obj as any)?.failed_generation
        if (fg) return typeof fg === 'string' ? fg : JSON.stringify(fg)
        return null
      }
      for (const c of [...candidates, dump]) {
        const fg = extractFailed(c)
        if (fg) return `Groq sinh tool-call hỏng. failed_generation:\n${fg}`
        // last resort: regex out of the stringified dump
        if (typeof c === 'string') {
          const m = c.match(/"failed_generation"\s*:\s*"((?:[^"\\]|\\.)*)"/)
          if (m) return `Groq sinh tool-call hỏng. failed_generation:\n${m[1]}`
        }
      }
      return err instanceof Error ? err.message : String(err)
    },
    execute: async ({ writer }) => {
      const result = streamText({
        model,
        // Low temperature keeps tool-call JSON valid. Groq llama-3.3 intermittently
        // emits malformed tool calls at its default temperature → `tool_use_failed`
        // (invalid_request_error) which aborts the whole stream. See repro in git history.
        temperature: 0,
        system: systemPrompt,
        messages: aiMessages as any,
        tools,
        stopWhen: stepCountIs(8),
        onStepFinish: async ({ toolCalls: stepToolCalls }: { toolCalls: any[] }) => {
          if (!stepToolCalls?.length) return
          const writeCalls = stepToolCalls.filter((tc: any) => WRITE_TOOLS.has(tc.toolName))
          if (writeCalls.length === 0) return
          const pendingCalls: ToolCall[] = writeCalls.map((tc: any) => ({
            id: tc.toolCallId,
            name: tc.toolName,
            input: tc.input as Record<string, unknown>,
          }))
          const preview = buildGhostPreview(pendingCalls)
          ;(writer.write as any)({ type: 'data-write-tools', data: { tool_calls: pendingCalls, preview } })
        },
      })
      writer.merge(result.toUIMessageStream())
    },
  })

  return createUIMessageStreamResponse({ stream })
}
