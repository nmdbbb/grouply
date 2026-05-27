import { CHUNK_SIZE, CHUNK_OVERLAP, MIN_CHUNK_LENGTH } from './constants'
const OVERLAP = CHUNK_OVERLAP

export function chunkText(text: string): Array<{ content: string; chunk_index: number }> {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (cleaned.length <= CHUNK_SIZE) return [{ content: cleaned, chunk_index: 0 }]

  const chunks: string[] = []
  let start = 0

  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE

    if (end < cleaned.length) {
      const breakPoints = ['\n\n', '\n', '. ', '! ', '? ', ' ']
      for (const bp of breakPoints) {
        const idx = cleaned.lastIndexOf(bp, end)
        if (idx > start + CHUNK_SIZE / 2) {
          end = idx + bp.length
          break
        }
      }
    }

    chunks.push(cleaned.slice(start, end).trim())
    start = end - OVERLAP
  }

  return chunks
    .filter(c => c.length > MIN_CHUNK_LENGTH)
    .map((content, i) => ({ content, chunk_index: i }))
}

export function detectDocSubType(
  filename: string,
  text: string
): 'rubric' | 'assignment_brief' | 'reference' | 'general' {
  const name = filename.toLowerCase()
  const body = text.toLowerCase()

  if (
    name.includes('rubric') ||
    body.includes('tiêu chí chấm') ||
    body.includes('grading criteria') ||
    /\b\d+\s*%\s*.{3,40}(điểm|point|mark)/i.test(text)
  ) return 'rubric'

  if (
    name.includes('đề bài') || name.includes('assignment') || name.includes('brief') ||
    body.includes('yêu cầu bài tập') || body.includes('nộp bài') ||
    body.includes('submission deadline') || body.includes('deliverable')
  ) return 'assignment_brief'

  if (
    name.includes('tài liệu') || name.includes('reference') || name.includes('handbook')
  ) return 'reference'

  return 'general'
}
