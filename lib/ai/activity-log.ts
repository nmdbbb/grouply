import { createClient } from '@/lib/supabase/server'
import { chunkText } from './chunker'
import { embedTexts } from './embed'

const ACTIVITY_LOG_DOC_NAME = '__activity_log__'

async function getOrCreateActivityLogDoc(projectId: string, supabase: any): Promise<string> {
  const { data: existing } = await supabase
    .from('project_documents')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', ACTIVITY_LOG_DOC_NAME)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('project_documents')
    .insert({
      project_id: projectId,
      name: ACTIVITY_LOG_DOC_NAME,
      path: `__virtual__/${projectId}/activity_log`,
      url: '',
      file_type: 'text/plain',
    })
    .select('id')
    .single()

  if (error || !created) throw new Error('Failed to create activity log doc')
  return created.id
}

export function buildActivitySummary(
  toolCalls: Array<{ name: string; input: Record<string, any> }>,
  projectContext: {
    memberNames: Record<string, string>
    taskNames: Record<string, string>
  }
): string {
  const date = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const lines: string[] = [`[${date}] AI thực hiện ${toolCalls.length} hành động:`]

  for (const tc of toolCalls) {
    switch (tc.name) {
      case 'add_task':
        lines.push(`- Thêm task "${tc.input.name}" vào section "${tc.input.section_name}"` +
          (tc.input.assignee_id ? ` (giao cho ${projectContext.memberNames[tc.input.assignee_id] ?? tc.input.assignee_id})` : ''))
        break

      case 'update_task': {
        const taskName = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id
        const fields = tc.input.fields ?? tc.input
        const changes: string[] = []
        if (fields.status)      changes.push(`status → ${fields.status}`)
        if (fields.assignee_id) changes.push(`assignee → ${projectContext.memberNames[fields.assignee_id] ?? fields.assignee_id}`)
        if (fields.deadline)    changes.push(`deadline → ${fields.deadline}`)
        if (fields.name)        changes.push(`tên → "${fields.name}"`)
        lines.push(`- Cập nhật task "${taskName}": ${changes.join(', ')}`)
        break
      }

      case 'delete_task': {
        const taskName = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id
        lines.push(`- Xóa task "${taskName}"`)
        break
      }

      case 'assign_tasks_batch':
        for (const a of (tc.input.assignments ?? [])) {
          const taskName = projectContext.taskNames[a.task_id] ?? a.task_id
          const memberName = projectContext.memberNames[a.assignee_id] ?? a.assignee_id
          lines.push(`- Giao task "${taskName}" cho ${memberName}`)
        }
        break

      case 'set_dependency': {
        const t1 = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id
        const t2 = projectContext.taskNames[tc.input.blocked_by_id] ?? tc.input.blocked_by_id
        lines.push(`- Đặt "${t1}" phụ thuộc vào "${t2}"`)
        break
      }

      case 'remove_dependency': {
        const t = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id
        lines.push(`- Xóa dependency của task "${t}"`)
        break
      }

      case 'add_section':
        lines.push(`- Thêm section "${tc.input.name}"`)
        break

      case 'add_checklist_item':
        lines.push(`- Thêm checklist item "${tc.input.name}"`)
        break

      case 'link_task_to_item': {
        const t = projectContext.taskNames[tc.input.task_id] ?? tc.input.task_id
        lines.push(`- Gắn task "${t}" với checklist item`)
        break
      }

      default:
        lines.push(`- ${tc.name}: ${JSON.stringify(tc.input).slice(0, 80)}`)
    }
  }

  return lines.join('\n')
}

export async function indexActivity(
  projectId: string,
  toolCalls: Array<{ name: string; input: Record<string, any> }>,
  projectContext: {
    memberNames: Record<string, string>
    taskNames: Record<string, string>
  },
  supabase?: any
): Promise<void> {
  const db = supabase ?? (await createClient())

  const documentId = await getOrCreateActivityLogDoc(projectId, db)
  const summary = buildActivitySummary(toolCalls, projectContext)
  const chunks = chunkText(summary)
  const embeddings = await embedTexts(chunks.map(c => c.content))

  const rows = chunks.map((chunk, i) => ({
    project_id: projectId,
    document_id: documentId,
    content: chunk.content,
    embedding: JSON.stringify(embeddings[i]),
    chunk_index: chunk.chunk_index,
    doc_type: 'activity_log',
    metadata: {
      action_types: [...new Set(toolCalls.map(tc => tc.name))],
      timestamp: new Date().toISOString(),
    },
  }))

  const { error } = await db.from('document_chunks').insert(rows)
  if (error) console.error('indexActivity error:', error)
}
