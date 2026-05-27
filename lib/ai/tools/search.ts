import { searchDocuments, hybridSearchChunks } from '../retrieval'
import { TOP_K_RESULTS } from '../constants'
import { getChunkScore } from '@/types'
import type { RetrievedChunk } from '@/types'
import type { ToolResult } from './types'

export async function handleSearchDocuments(
  input: Record<string, unknown>,
  projectId: string,
  supabase: any
): Promise<ToolResult> {
  const { query, doc_type, use_hybrid = false, match_count = TOP_K_RESULTS } = input as {
    query: string
    doc_type?: 'project_doc' | 'activity_log'
    use_hybrid?: boolean
    match_count?: number
  }

  let results: RetrievedChunk[]

  if (use_hybrid) {
    try {
      results = await hybridSearchChunks(query, projectId, supabase, {
        matchCount: match_count,
        docType: doc_type ?? null,
      })
    } catch (err) {
      console.error('[search_documents] hybrid failed, falling back to vector:', err)
      results = await searchDocuments(query, projectId, supabase, match_count, doc_type ?? null)
    }
  } else {
    results = await searchDocuments(query, projectId, supabase, match_count, doc_type ?? null)
  }

  if (!results.length) {
    return {
      toolName: 'search_documents',
      result: doc_type === 'activity_log'
        ? 'Chưa có lịch sử hoạt động nào được ghi lại.'
        : 'Không tìm thấy nội dung liên quan trong tài liệu.',
    }
  }

  const label = (r: RetrievedChunk) =>
    r.doc_type === 'activity_log'
      ? '[activity_log]'
      : `[${(r.metadata as any)?.sub_type ?? 'project_doc'}] ${r.document_name}`

  const formatted = results
    .map((r, i) => `[${i + 1}] ${label(r)} (score: ${(getChunkScore(r) * 100).toFixed(0)}%)\n${r.content}`)
    .join('\n---\n')

  return { toolName: 'search_documents', result: formatted }
}
