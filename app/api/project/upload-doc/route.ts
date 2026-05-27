import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { chunkText, detectDocSubType } from '@/lib/ai/chunker'
import { embedTexts } from '@/lib/ai/embed'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const projectId = formData.get('project_id') as string

  if (!file || !projectId) return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 })

  const { data: membership } = await supabase
    .from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const ext = file.name.split('.').pop()?.toLowerCase()
  const path = `${projectId}/${Date.now()}-${file.name}`
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Upload to storage
  const { error: uploadError } = await service.storage
    .from('project-docs')
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = service.storage.from('project-docs').getPublicUrl(path)

  // Save document record
  const { data: docRecord } = await service.from('project_documents').insert({
    project_id: projectId,
    name: file.name,
    path,
    url: publicUrl,
    file_type: ext ?? 'unknown',
    uploaded_by: user.id,
  }).select('id').single()

  // Extract text for embedding
  let fullText = ''
  try {
    if (ext === 'pdf') {
      const pdfParseModule = await import('pdf-parse')
      const pdfParse = (pdfParseModule as any).default ?? pdfParseModule
      const parsed = await pdfParse(buffer)
      fullText = parsed.text
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      fullText = result.value
    } else if (ext === 'txt') {
      fullText = buffer.toString('utf-8')
    }
  } catch {
    // Embedding optional — don't fail the upload
  }

  // Chunk + embed in background (non-blocking response)
  if (fullText && docRecord?.id) {
    const documentId = docRecord.id
    ;(async () => {
      try {
        const subType = detectDocSubType(file.name, fullText)
        const chunks = chunkText(fullText)
        const embeddings = await embedTexts(chunks.map(c => c.content))

        const rows = chunks.map((chunk, i) => ({
          project_id: projectId,
          document_id: documentId,
          content: chunk.content,
          embedding: JSON.stringify(embeddings[i]),
          chunk_index: chunk.chunk_index,
          doc_type: 'project_doc',
          metadata: { sub_type: subType },
        }))

        await service.from('document_chunks').insert(rows)
      } catch (err) {
        console.error('[embed] Failed to embed document:', err)
      }
    })()
  }

  return NextResponse.json({ path, name: file.name, url: publicUrl })
}
