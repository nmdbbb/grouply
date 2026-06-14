export async function resolveSectionId(
  sectionIdOrNull: string | null | undefined,
  sectionName: string | undefined,
  projectId: string,
  supabase: any
): Promise<string | null> {
  if (sectionIdOrNull) {
    console.log('[sectionResolver] using section_id directly:', sectionIdOrNull)
    return sectionIdOrNull
  }
  if (!sectionName) {
    console.log('[sectionResolver] no section_id or section name → null')
    return null
  }
  const { data, error } = await supabase
    .from('sections')
    .select('id, name')
    .eq('project_id', projectId)
    .ilike('name', `%${sectionName}%`)
    .limit(1)
  console.log('[sectionResolver] lookup "%s" → data=%s error=%s', sectionName, JSON.stringify(data), JSON.stringify(error))
  return data?.[0]?.id ?? null
}
