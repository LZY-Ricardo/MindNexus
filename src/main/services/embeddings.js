import { pipeline } from '@xenova/transformers'

let extractorPromise = null

/**
 * 获取并复用 Embedding 管道（首次会下载/初始化模型，后续复用）。
 */
export async function getEmbeddingPipeline() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
  return extractorPromise
}

/**
 * 将文本转为 384 维向量（mean pooling + normalize）。
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const extractor = await getEmbeddingPipeline()
  const output = await extractor(text, { pooling: 'mean', normalize: true })

  const vectorLike = output?.data
  if (!vectorLike || typeof vectorLike.length !== 'number') {
    throw new Error('Embedding 输出格式不符合预期')
  }

  return Array.from(vectorLike)
}
