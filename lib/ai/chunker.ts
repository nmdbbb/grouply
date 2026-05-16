const CHUNK_SIZE = 500   // characters (không phải tokens, đủ nhỏ cho embed)
const OVERLAP = 80

export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (cleaned.length <= CHUNK_SIZE) return [cleaned]

  const chunks: string[] = []
  let start = 0

  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE

    // Cắt tại ranh giới câu/dòng để tránh cắt giữa chừng
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

  return chunks.filter(c => c.length > 20)
}
