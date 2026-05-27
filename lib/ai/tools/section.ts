import { SECTION_COLORS } from '../constants'
import type { ToolResult } from './types'

export async function handleAddSection(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const { data: existing } = await supabase
    .from('sections')
    .select('id')
    .eq('project_id', projectId)
  const color = (input.color as string) || SECTION_COLORS[(existing?.length ?? 0) % SECTION_COLORS.length]
  const { data } = await supabase.from('sections').insert({
    project_id: projectId,
    name: input.name as string,
    color,
    ord: existing?.length ?? 0,
  }).select().single()
  return { toolName: 'add_section', result: data }
}
