import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { path, project_id } = await request.json()
  if (!path || !project_id) return NextResponse.json({ error: 'Missing path or project_id' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Download file từ Storage
  const { data: fileData, error } = await service.storage.from('project-docs').download(path)
  if (error || !fileData) return NextResponse.json({ error: 'Cannot download file' }, { status: 500 })

  const ext = path.split('.').pop()?.toLowerCase()
  let text = ''

  try {
    const buffer = Buffer.from(await fileData.arrayBuffer())

    if (ext === 'pdf') {
      const pdfParseModule = await import('pdf-parse')
      const pdfParse = (pdfParseModule as any).default ?? pdfParseModule
      const parsed = await pdfParse(buffer)
      text = parsed.text
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (ext === 'txt') {
      text = buffer.toString('utf-8')
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, DOCX, or TXT.' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Extract failed: ${err.message}` }, { status: 500 })
  }

  // Giới hạn 8000 ký tự để tránh vượt context AI
  const truncated = text.slice(0, 8000)
  return NextResponse.json({ text: truncated, truncated: text.length > 8000 })
}
