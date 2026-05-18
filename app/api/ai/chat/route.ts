import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildProjectContext } from '@/lib/ai/context'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { TOOL_DEFINITIONS } from '@/lib/ai/tools'
import { executeToolCall, executeToolCalls, buildGhostPreview } from '@/lib/ai/execute'
import { runGroqAgenticLoop } from '@/lib/ai/groq'
import type { ToolCall } from '@/stores/chatStore'

// Tools that mutate data — require user confirmation before executing
const WRITE_TOOLS = new Set([
  'add_task', 'update_task', 'delete_task',
  'add_section', 'add_checklist_item',
  'link_task_to_item', 'set_dependency', 'remove_dependency',
  'assign_tasks_batch',
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { project_id, message, conversation_history = [], commit_tool_calls, attached_text, reply_to, provider = 'anthropic' } = body

  // --- Commit path (unchanged) ---
  if (commit_tool_calls && Array.isArray(commit_tool_calls)) {
    const results = await executeToolCalls(commit_tool_calls as ToolCall[], project_id, user.id, supabase)
    return Response.json({ executed: true, results })
  }

  const { data: profile } = await supabase.from('profiles').select('name, byok_key').eq('id', user.id).single()
  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', project_id).eq('user_id', user.id).single()
  if (!membership) return new Response('Forbidden', { status: 403 })

  const byokKey = profile?.byok_key
    ? Buffer.from(profile.byok_key, 'base64').toString('utf-8')
    : null

  const anthropicKey = byokKey ?? process.env.ANTHROPIC_API_KEY!
  const groqKey = process.env.GROQ_API_KEY!

  const context = await buildProjectContext(project_id)
  const systemPrompt = buildSystemPrompt(context, profile?.name ?? 'Unknown', membership.role, user.id, 'api', provider === 'groq' ? 'groq' : undefined)

  // Build user message content — inject attached file text and reply quote inline
  let userContent = message as string
  if (reply_to) userContent = `[Trả lời: "${reply_to}"]\n\n${userContent}`
  if (attached_text) userContent += `\n\n---\n[NỘI DUNG FILE ĐÍNH KÈM]\n${attached_text}`

  // Sliding window: keep last 12 messages (6 turns) to bound token cost
  const trimmedHistory = (conversation_history as { role: string; content: string }[]).slice(-12)

  const messages: Anthropic.MessageParam[] = [
    ...trimmedHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userContent },
  ]

  // --- SSE streaming response ---
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      try {
        if (provider === 'groq') {
          await runGroqAgenticLoop({
            apiKey: groqKey,
            systemPrompt,
            messages: trimmedHistory.concat([{ role: 'user', content: userContent }]),
            projectId: project_id,
            userId: user.id,
            supabase,
            send,
          })
          send({ type: 'done' })
          return
        }

        const anthropic = new Anthropic({ apiKey: anthropicKey })

        // Agentic loop — max 8 iterations to avoid infinite loops
        for (let iteration = 0; iteration < 8; iteration++) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            tools: TOOL_DEFINITIONS,
            messages,
          })

          // Stream text blocks
          const toolUses: Anthropic.ToolUseBlock[] = []

          for (const block of response.content) {
            if (block.type === 'text') {
              // Stream text in ~50 char chunks to simulate streaming
              const chunks = block.text.match(/[\s\S]{1,50}/g) ?? [block.text]
              for (const chunk of chunks) {
                send({ type: 'text_delta', text: chunk })
              }
            } else if (block.type === 'tool_use') {
              toolUses.push(block)
            }
          }

          // Append assistant turn to messages for next iteration
          messages.push({ role: 'assistant', content: response.content })

          // If no tool calls or end_turn — we're done
          if (response.stop_reason === 'end_turn' || toolUses.length === 0) break

          // Separate read vs write tools
          const readTools = toolUses.filter(t => !WRITE_TOOLS.has(t.name))
          const writeTools = toolUses.filter(t => WRITE_TOOLS.has(t.name))

          // If there are write tools — stop the loop, send for user confirmation
          if (writeTools.length > 0) {
            const writeCalls: ToolCall[] = writeTools.map(t => ({
              id: t.id,
              name: t.name,
              input: t.input as Record<string, unknown>,
            }))
            const preview = buildGhostPreview(writeCalls)
            send({ type: 'write_tools', tool_calls: writeCalls, preview })
            break
          }

          // Execute read tools silently, feed results back
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const tool of readTools) {
            send({ type: 'tool_running', tool: tool.name })
            const result = await executeToolCall(
              { id: tool.id, name: tool.name, input: tool.input as Record<string, unknown> },
              project_id,
              user.id,
              supabase,
            )
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tool.id,
              content: JSON.stringify(result.result),
            })
          }

          messages.push({ role: 'user', content: toolResults })
        }

        send({ type: 'done' })
      } catch (err: any) {
        send({ type: 'error', message: err.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
