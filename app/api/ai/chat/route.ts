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
    provider = 'anthropic',
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

  const byokKeys = (profile?.byok_keys ?? {}) as Record<string, string>
  const providerId = (provider in PROVIDERS ? provider : 'anthropic') as ProviderId
  const rawKey = byokKeys[providerId]
    ? Buffer.from(byokKeys[providerId], 'base64').toString('utf-8')
    : process.env[PROVIDERS[providerId].envKey] ?? ''

  const model = getModelInstance(providerId, rawKey)

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

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: aiMessages as any,
        tools,
        stopWhen: stepCountIs(8),
        onStepFinish: async ({ toolCalls: stepToolCalls }) => {
          if (!stepToolCalls?.length) return

          const writeCalls = stepToolCalls.filter(tc => WRITE_TOOLS.has(tc.toolName))
          if (writeCalls.length === 0) return

          const pendingCalls: ToolCall[] = writeCalls.map(tc => ({
            id: tc.toolCallId,
            name: tc.toolName,
            input: tc.input as Record<string, unknown>,
          }))
          const preview = buildGhostPreview(pendingCalls)

          // Send write tools to client via custom data chunk
          ;(writer.write as any)({ type: 'data-write-tools', data: { tool_calls: pendingCalls, preview } })
        },
      })

      writer.merge(result.toUIMessageStream())
    },
  })

  return createUIMessageStreamResponse({ stream })
}
