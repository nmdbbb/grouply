import type { ToolResult } from './types'

export async function handleAddChecklistItem(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const { data: existing } = await supabase
    .from('checklist_items')
    .select('id')
    .eq('project_id', projectId)
  const { data } = await supabase.from('checklist_items').insert({
    project_id: projectId,
    name: input.name as string,
    description: (input.description as string) || null,
    ord: existing?.length ?? 0,
  }).select().single()
  return { toolName: 'add_checklist_item', result: data }
}

export async function handleLinkTaskToItem(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .update({ checklist_item_id: input.checklist_item_id as string })
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'link_task_to_item', result: data }
}
