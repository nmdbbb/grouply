import { embedQuery } from './embed'

export interface RetrievedChunk {
  content: string
  document_name: string
  chunk_index: number
  similarity: number
}

export async function searchDocuments(
  query: string,
  projectId: string,
  supabase: any,
  topK = 5
): Promise<RetrievedChunk[]> {
  const queryVec = await embedQuery(query)

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryVec,
    match_project_id: projectId,
    match_count: topK,
  })

  if (error) throw new Error(`Vector search error: ${error.message}`)

  return (data ?? []).map((row: any) => ({
    content: row.content,
    document_name: row.document_name,
    chunk_index: row.chunk_index,
    similarity: row.similarity,
  }))
}
