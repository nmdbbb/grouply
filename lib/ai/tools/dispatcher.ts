import { handleSearchDocuments } from './search'
import { handleReadProject, handleReadTask, handleReadMemberLoad, handleReadTasksBySection } from './project'
import { handleAddTask, handleUpdateTask, handleDeleteTask, handleAssignTasksBatch } from './task'
import { handleAddSection } from './section'
import { handleAddChecklistItem, handleLinkTaskToItem } from './checklist'
import { handleSetDependency, handleRemoveDependency } from './dependency'
import type { ToolResult } from './types'
import type { ToolCall } from '@/stores/chatStore'

export async function executeToolCall(
  tool: ToolCall,
  projectId: string,
  userId: string,
  supabase: any
): Promise<ToolResult> {
  const { name, input } = tool
  try {
    switch (name) {
      case 'search_documents':   return await handleSearchDocuments(input, projectId, supabase)
      case 'read_project':       return await handleReadProject(projectId)
      case 'read_task':          return await handleReadTask(input, projectId, supabase)
      case 'read_member_load':   return await handleReadMemberLoad(projectId, supabase)
      case 'read_tasks_by_section': return await handleReadTasksBySection(input, projectId, supabase)
      case 'add_task':           return await handleAddTask(input, projectId, userId, supabase)
      case 'update_task':        return await handleUpdateTask(input, supabase)
      case 'delete_task':        return await handleDeleteTask(input, supabase)
      case 'add_section':        return await handleAddSection(input, projectId, supabase)
      case 'add_checklist_item': return await handleAddChecklistItem(input, projectId, supabase)
      case 'link_task_to_item':  return await handleLinkTaskToItem(input, supabase)
      case 'set_dependency':     return await handleSetDependency(input, supabase)
      case 'remove_dependency':  return await handleRemoveDependency(input, supabase)
      case 'assign_tasks_batch': return await handleAssignTasksBatch(input, projectId, supabase)
      default:
        return { toolName: name, result: null, error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    return { toolName: name, result: null, error: err.message }
  }
}

export async function executeToolCalls(
  toolCalls: ToolCall[],
  projectId: string,
  userId: string,
  supabase: any
): Promise<ToolResult[]> {
  // add_section must run before add_task so the new section ID is available
  const sorted = [
    ...toolCalls.filter(tc => tc.name === 'add_section'),
    ...toolCalls.filter(tc => tc.name !== 'add_section'),
  ]

  const sectionNameToId: Record<string, string> = {}
  const results: ToolResult[] = []

  for (let tc of sorted) {
    if (tc.name === 'add_task') {
      console.log('[dispatcher] add_task input:', JSON.stringify(tc.input))
      if (!tc.input.section_id && tc.input.section) {
        const sectionName = (tc.input.section as string).toLowerCase()
        // Exact match first, then fuzzy
        const resolvedId = sectionNameToId[tc.input.section as string]
          ?? Object.entries(sectionNameToId).find(([k]) =>
            k.toLowerCase() === sectionName ||
            k.toLowerCase().includes(sectionName) ||
            sectionName.includes(k.toLowerCase())
          )?.[1]
        if (resolvedId) {
          tc = { ...tc, input: { ...tc.input, section_id: resolvedId } }
          console.log('[dispatcher] patched section_id from batch:', resolvedId)
        }
      }
    }

    const result = await executeToolCall(tc, projectId, userId, supabase)
    console.log('[dispatcher]', tc.name, '→ result:', JSON.stringify(result).slice(0, 200))

    if (tc.name === 'add_section' && result.result) {
      const sec = result.result as any
      if (sec?.id && tc.input.name) {
        sectionNameToId[tc.input.name as string] = sec.id
        console.log('[dispatcher] saved sectionNameToId:', tc.input.name, '→', sec.id)
      }
    }

    results.push(result)
  }

  return results
}
