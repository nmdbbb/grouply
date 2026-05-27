import { embedQuery } from './embed'
import { TOP_K_RESULTS, HYBRID_VECTOR_WEIGHT, HYBRID_TEXT_WEIGHT } from './constants'
import type { RetrievedChunk, VectorChunk, HybridChunk } from '@/types'

export type { RetrievedChunk }

export async function searchDocuments(
  query: string,
  projectId: string,
  supabase: any,
  topK = TOP_K_RESULTS,
  docType?: string | null
): Promise<VectorChunk[]> {
  const queryVec = await embedQuery(query)

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryVec,
    match_project_id: projectId,
    match_count: topK,
    filter_doc_type: docType ?? null,
  })

  if (error) throw new Error(`[retrieval] vector search failed: ${error.message}`)

  return (data ?? []).map((row: any): VectorChunk => ({
    source: 'vector',
    content: row.content,
    document_name: row.document_name,
    chunk_index: row.chunk_index,
    similarity: row.similarity,
    doc_type: row.doc_type,
    metadata: row.metadata,
  }))
}

export async function hybridSearchChunks(
  query: string,
  projectId: string,
  supabase: any,
  options?: {
    matchCount?: number
    docType?: 'project_doc' | 'activity_log' | null
    vectorWeight?: number
    textWeight?: number
  }
): Promise<HybridChunk[]> {
  const queryVec = await embedQuery(query)

  const { data, error } = await supabase.rpc('hybrid_search_chunks', {
    query_embedding: queryVec,
    query_text: query,
    match_project_id: projectId,
    match_count: options?.matchCount ?? TOP_K_RESULTS,
    filter_doc_type: options?.docType ?? null,
    vector_weight: options?.vectorWeight ?? HYBRID_VECTOR_WEIGHT,
    text_weight: options?.textWeight ?? HYBRID_TEXT_WEIGHT,
  })

  if (error) throw new Error(`[retrieval] hybrid search failed: ${error.message}`)

  return (data ?? []).map((row: any): HybridChunk => ({
    source: 'hybrid',
    content: row.content,
    document_name: row.document_name,
    chunk_index: row.chunk_index,
    combined_score: row.combined_score,
    doc_type: row.doc_type,
    metadata: row.metadata,
  }))
}
