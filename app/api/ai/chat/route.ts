import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildProjectContext } from '@/lib/ai/context'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { TOOL_DEFINITIONS } from '@/lib/ai/tools'
import { executeToolCalls, buildGhostPreview } from '@/lib/ai/execute'
import type { ToolCall } from '@/stores/chatStore'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { project_id, message, conversation_history = [], commit_tool_calls } = body

  if (commit_tool_calls && Array.isArray(commit_tool_calls)) {
    console.log('[commit] tool_calls count:', commit_tool_calls.length)
    const results = await executeToolCalls(commit_tool_calls as ToolCall[], project_id, user.id, supabase)
    const errors = results.filter(r => r.error)
    const taskResults = results.filter(r => r.toolName === 'add_task')
    console.log('[commit] task results:', JSON.stringify(taskResults))
    console.log('[commit] errors:', JSON.stringify(errors))
    return NextResponse.json({ executed: true, results })
  }

  const { data: profile } = await supabase.from('profiles').select('name, byok_key').eq('id', user.id).single()
  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const apiKey = profile?.byok_key
    ? Buffer.from(profile.byok_key, 'base64').toString('utf-8')
    : process.env.ANTHROPIC_API_KEY!

  const context = await buildProjectContext(project_id)
  const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id)

  const anthropic = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [
    ...conversation_history.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    tools: TOOL_DEFINITIONS,
    messages,
  })

  let textContent = ''
  const toolCalls: ToolCall[] = []

  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
    }
  }

  const preview = toolCalls.length > 0 ? buildGhostPreview(toolCalls) : null

  return NextResponse.json({ text: textContent, tool_calls: toolCalls, preview })
}
