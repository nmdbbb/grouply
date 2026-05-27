import type { ToolResult } from './types'

export async function handleSetDependency(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .update({ blocked_by_id: input.blocked_by_id as string })
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'set_dependency', result: data }
}

export async function handleRemoveDependency(input: Record<string, unknown>, supabase: any): Promise<ToolResult> {
  const { data } = await supabase
    .from('tasks')
    .update({ blocked_by_id: null })
    .eq('id', input.task_id as string)
    .select()
    .single()
  return { toolName: 'remove_dependency', result: data }
}
