import { ipcMain } from 'electron'
import { processFile } from './services/ingestor'
import { search } from './services/search'
import { chatStream } from './services/llm'

let initialized = false

export function setupIPC() {
  if (initialized) return
  initialized = true

  // A. 窗口管理 (win)
  ipcMain.handle('win:toggle-float', async () => {
    console.log('[ipc] win:toggle-float (not implemented yet)')
  })

  ipcMain.handle('win:set-size', async (_event, payload) => {
    console.log('[ipc] win:set-size (not implemented yet)', payload)
  })

  ipcMain.handle('win:open-main', async () => {
    console.log('[ipc] win:open-main (not implemented yet)')
  })

  // B. 文件系统与导入 (file)
  ipcMain.handle('file:process', async (_event, payload) => {
    const filePath = payload?.filePath
    if (!filePath) return { success: false, uuid: '', message: 'filePath 不能为空' }
    return await processFile(filePath)
  })

  ipcMain.handle('file:list', async (_event, payload) => {
    console.log('[ipc] file:list (not implemented yet)', payload)
    return []
  })

  ipcMain.handle('file:delete', async (_event, payload) => {
    console.log('[ipc] file:delete (not implemented yet)', payload)
    return { success: true, message: 'Not implemented yet' }
  })

  // C. 知识库与 AI (rag)
  ipcMain.handle('rag:search', async (_event, payload) => {
    const query = payload?.query ?? ''
    const limit = Number(payload?.limit ?? 5)
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 5
    return await search(query, safeLimit)
  })

  ipcMain.handle('rag:chat-start', (event, payload) => {
    const sender = event.sender

    void (async () => {
      const query = String(payload?.query ?? '').trim()
      const model = payload?.model ?? 'llama3'
      const history = Array.isArray(payload?.history) ? payload.history : []

      const chunks = await search(query, 5)
      const prompt = [
        'You are a helpful knowledge assistant.',
        'Context:',
        chunks.map((c) => c.text).join('\n---\n'),
        '',
        `User Question: ${query}`,
        '',
        `Answer based ONLY on the context above. If unsure, say "I don't know".`
      ].join('\n')

      const messages = [
        ...history
          .filter((m) => m && typeof m === 'object')
          .map((m) => ({ role: String(m.role ?? 'user'), content: String(m.content ?? '') })),
        { role: 'user', content: prompt }
      ]

      try {
        await chatStream(
          messages,
          (token) => sender.send('rag:chat-token', { token, done: false }),
          model
        )
      } catch (error) {
        const msg = String(error?.message || error)
        sender.send('rag:chat-token', { token: `\n[错误] ${msg}\n`, done: false })
      } finally {
        sender.send('rag:chat-token', { token: '', done: true })
      }
    })()
  })
}
