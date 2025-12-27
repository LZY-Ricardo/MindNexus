import { pipeline } from '@xenova/transformers'
import { getConfig } from '../config'

let extractorPromise = null
let backendPromise = null

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

function getEmbedUrl() {
  const config = getConfig()
  const base = String(config?.ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '')
  return `${base}/api/embeddings`
}

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
 * 初始化 Embedding 后端。
 * - transformers：使用 @xenova/transformers（可能需要下载模型文件）
 * - ollama：使用本地 Ollama embeddings（推荐离线/国内网络环境）
 * @param {'transformers'|'ollama'|'auto'} [preferred]
 * @returns {Promise<'transformers'|'ollama'>}
 */
export async function initEmbeddings(preferred) {
  if (backendPromise) return backendPromise

  backendPromise = (async () => {
    const config = getConfig()
    const want = String(preferred || config?.embeddingsBackend || 'auto').toLowerCase()

    if (want === 'transformers') {
      await getEmbeddingPipeline()
      return 'transformers'
    }

    if (want === 'ollama') {
      // 这里不强制探活，embedText 会给出明确错误
      return 'ollama'
    }

    // auto：优先 transformers，失败则退回 ollama
    try {
      await getEmbeddingPipeline()
      return 'transformers'
    } catch (error) {
      console.warn('[embeddings] transformers 初始化失败，已回退到 ollama embeddings', error)
      return 'ollama'
    }
  })()

  return backendPromise
}

export function resetEmbeddings() {
  extractorPromise = null
  backendPromise = null
}

async function embedWithOllama(text, model) {
  const config = getConfig()
  const resolvedModel = String(model || config?.embeddingsModel || 'nomic-embed-text:latest')
  const response = await fetch(getEmbedUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: resolvedModel, prompt: text })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Ollama embeddings 请求失败: ${response.status} ${response.statusText} ${body}`.trim()
    )
  }

  const json = await response.json().catch(() => ({}))
  const embedding = json?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Ollama embeddings 响应格式不正确（缺少 embedding 数组）')
  }

  return embedding.map((v) => Number(v))
}

/**
 * 将文本转为向量（用于语义检索）。
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const input = String(text ?? '').trim()
  if (!input) return []

  const backend = await initEmbeddings()

  if (backend === 'ollama') {
    return await embedWithOllama(input)
  }

  const extractor = await getEmbeddingPipeline()
  const output = await extractor(input, { pooling: 'mean', normalize: true })

  const vectorLike = output?.data
  if (!vectorLike || typeof vectorLike.length !== 'number') {
    throw new Error('Embedding 输出格式不符合预期')
  }

  return Array.from(vectorLike)
}
