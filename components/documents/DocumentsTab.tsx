'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'

interface Doc {
  id: string
  name: string
  path: string
  url: string
  file_type: string
  created_at: string
  uploaded_by: string
}

interface Props {
  projectId: string
  onAnalyze: (text: string, fileName: string) => void
}

const FILE_ICONS: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  doc: '📝',
  txt: '📃',
}

export function DocumentsTab({ projectId, onAnalyze }: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { loadDocs() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDocs() {
    const { data } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as Doc[])
  }

  async function uploadFile(file: File) {
    if (!file) return
    const allowed = ['pdf', 'docx', 'doc', 'txt']
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowed.includes(ext)) {
      alert('Chỉ hỗ trợ PDF, DOCX, DOC, TXT')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File tối đa 10MB')
      return
    }

    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('project_id', projectId)

    const res = await fetch('/api/project/upload-doc', { method: 'POST', body: form })
    if (res.ok) {
      await loadDocs()
    } else {
      const err = await res.json()
      alert(`Upload lỗi: ${err.error}`)
    }
    setUploading(false)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
    e.target.value = ''
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await uploadFile(file)
  }

  async function handleAnalyze(doc: Doc) {
    setExtracting(doc.id)
    const res = await fetch('/api/project/extract-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: doc.path, project_id: projectId }),
    })
    const data = await res.json()
    setExtracting(null)
    if (!res.ok) {
      alert(`Lỗi extract: ${data.error}`)
      return
    }
    if (data.truncated) {
      alert('File dài, chỉ lấy 8000 ký tự đầu.')
    }
    onAnalyze(data.text, doc.name)
  }

  async function handleDelete(doc: Doc) {
    if (!confirm(`Xóa "${doc.name}"?`)) return
    await supabase.from('project_documents').delete().eq('id', doc.id)
    // Xóa file khỏi storage qua service role (client không có quyền)
    await fetch('/api/project/delete-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: doc.path, project_id: projectId }),
    })
    loadDocs()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mx-4 mt-4 border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
          dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <span className="text-2xl">{uploading ? '⏳' : '📎'}</span>
        <p className="text-sm font-medium text-gray-700">
          {uploading ? 'Đang upload...' : 'Kéo thả hoặc click để upload'}
        </p>
        <p className="text-xs text-muted-foreground">PDF, DOCX, TXT · Tối đa 10MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Doc list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Chưa có tài liệu nào.</p>
        )}
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow">
            <span className="text-xl shrink-0">{FILE_ICONS[doc.file_type] ?? '📄'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.name}</p>
              <p className="text-xs text-muted-foreground uppercase">{doc.file_type}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline px-2 py-1"
                onClick={e => e.stopPropagation()}
              >
                Xem
              </a>
              <button
                onClick={() => handleAnalyze(doc)}
                disabled={extracting === doc.id}
                className="text-xs bg-violet-100 text-violet-700 hover:bg-violet-200 px-2 py-1 rounded-md font-medium disabled:opacity-50"
              >
                {extracting === doc.id ? '⏳' : '🤖 Phân tích'}
              </button>
              <button
                onClick={() => handleDelete(doc)}
                className="text-xs text-red-400 hover:text-red-600 px-1 py-1"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
