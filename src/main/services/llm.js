const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat'

/**
 * 调用 Ollama /api/chat 并处理流式响应；每收到一段增量文本就回调 onToken。
 * @param {Array<{role: string, content: string}>} messages
 * @param {(token: string) => void} onToken
 * @param {string} model
 */
export async function chatStream(messages, onToken, model = 'llama3') {
  const response = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages
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
