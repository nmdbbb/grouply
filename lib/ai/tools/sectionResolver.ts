export async function resolveSectionId(
  sectionIdOrNull: string | null | undefined,
  sectionName: string | undefined,
  projectId: string,
  supabase: any
): Promise<string | null> {
  if (sectionIdOrNull) {
    // Validate the section actually belongs to this project (prevent cross-project injection)
    const { data } = await supabase
      .from('sections')
      .select('id')
      .eq('id', sectionIdOrNull)
      .eq('project_id', projectId)
      .single()
    return data?.id ?? null
  }
  if (!sectionName) return null
  const { data } = await supabase
    .from('sections')
    .select('id')
    .eq('project_id', projectId)
    .ilike('name', `%${sectionName}%`)
    .limit(1)
  return data?.[0]?.id ?? null
}
