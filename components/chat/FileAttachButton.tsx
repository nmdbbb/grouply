'use client'
import { useRef } from 'react'
import { Paperclip } from 'lucide-react'

interface Props {
  onExtracted: (file: { name: string; text: string }) => void
}

export function FileAttachButton({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!inputRef.current) return
    inputRef.current.value = ''
    if (!file) return

    try {
      if (file.type === 'text/plain') {
        const text = await file.text()
        onExtracted({ name: file.name, text })
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/project/extract-doc', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Extract failed')
      const { text } = await res.json()
      onExtracted({ name: file.name, text })
    } catch {
      alert('Không thể đọc file. Hỗ trợ: PDF, DOCX, TXT.')
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors shrink-0"
        title="Đính kèm file (PDF, DOCX, TXT)"
      >
        <Paperclip size={16} />
      </button>
    </>
  )
}
