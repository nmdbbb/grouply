import { pipeline, env } from '@xenova/transformers'

env.cacheDir = './.cache/transformers'
env.allowLocalModels = false

type EmbedPipeline = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>

let embedder: EmbedPipeline | null = null

async function getEmbedder(): Promise<EmbedPipeline> {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as unknown as EmbedPipeline
  }
  return embedder
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await getEmbedder()
  const results: number[][] = []
  for (const text of texts) {
    const output = await model(text, { pooling: 'mean', normalize: true })
    results.push(Array.from(output.data))
  }
  return results
}

export async function embedQuery(text: string): Promise<number[]> {
  const vecs = await embedTexts([text])
  return vecs[0]
}
