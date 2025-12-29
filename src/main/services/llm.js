import { getConfig } from '../config'

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

function getChatUrl() {
  const config = getConfig()
  const base = String(config?.ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '')
  return `${base}/api/chat`
}

function getGenerateUrl() {
  const config = getConfig()
  const base = String(config?.ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '')
  return `${base}/api/generate`
}

/**
 * 调用 Ollama /api/chat 并处理流式响应；每收到一段增量文本就回调 onToken。
 * @param {Array<{role: string, content: string}>} messages
 * @param {(token: string) => void} onToken
 * @param {string} model
 */
export async function chatStream(messages, onToken, model = 'llama3') {
  const config = getConfig()
  const resolvedModel = String(model || config?.ollamaModel || 'llama3')
  const response = await fetch(getChatUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: resolvedModel,
      stream: true,
      messages,
      // 添加选项确保中文输出
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_ctx: 4096
      },
      // 强制系统指令
      system: '你必须使用用户使用的对应语言来回答问题。',
      // 保持对话上下文格式
      format: ''
    })
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Ollama 请求失败: ${response.status} ${response.statusText} ${text}`.trim())
  }

  if (!response.body) throw new Error('Ollama 响应缺少 body（无法流式读取）')
  if (typeof onToken !== 'function') throw new Error('onToken 必须是函数')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) break

      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (!line) continue

      let json
      try {
        json = JSON.parse(line)
      } catch {
        continue
      }

      const token = json?.message?.content
      if (token) onToken(token)

      if (json?.done) return
    }
  }

  const tail = buffer.trim()
  if (!tail) return

  try {
    const json = JSON.parse(tail)
    const token = json?.message?.content
    if (token) onToken(token)
  } catch {
    // 忽略尾部残片
  }
}

/**
 * 生成会话标题
 * @param {string} firstMessage - 第一条用户消息
 * @param {string} model - 模型名称
 * @returns {Promise<string>} 生成的标题
 */
export async function generateTitle(firstMessage, model = 'llama3') {
  const config = getConfig()
  const resolvedModel = String(model || config?.ollamaModel || 'llama3')

  const response = await fetch(getGenerateUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: resolvedModel,
      prompt: `请将以下用户问题概括为一个简短的中文标题，最多8个字，只返回标题本身，不要任何标点符号、引号或解释。

问题：${firstMessage}

标题：`,
      stream: false,
      options: {
        temperature: 0.3,
        top_p: 0.9
      },
      system: '你必须使用中文，只返回简短的标题，不要任何解释或标点符号。'
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama 请求失败: ${response.status}`)
  }

  const data = await response.json()
  let title = data?.response?.trim() || ''

  // 清理可能的引号、冒号、换行和多余字符
  title = title
    .replace(/[\n\r]+/g, ' ')
    .replace(/^["'「【\s:：标题Title]+|["'」】\s]+$/gi, '')
    .replace(/\s+/g, '')
    .trim()

  // 如果生成结果太长或者和原文一样，使用截取方式
  if (!title || title.length > 15 || title === firstMessage.slice(0, 15)) {
    title = firstMessage.slice(0, 12) + (firstMessage.length > 12 ? '...' : '')
  }

  return title
}
