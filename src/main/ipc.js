import { app, ipcMain, shell } from 'electron'
import { db, initDatabase, vectorStore } from './database'
import { processFile } from './services/ingestor'
import { search } from './services/search'
import { chatStream } from './services/llm'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

function sanitizeFileName(name) {
  const raw = String(name ?? '')
  let out = ''
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    if (code < 32) continue
    out += '<>:"/\\|?*'.includes(ch) ? '_' : ch
  }
  return out.replaceAll(/\s+/g, ' ').trim()
}

function toBuffer(data) {
  if (!data) return Buffer.alloc(0)
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  return Buffer.from(data)
}

let initialized = false

export function setupIPC({ toggleFloatWindow, setFloatWindowSize, showMainWindow } = {}) {
  if (initialized) return
  initialized = true

  // A. 窗口管理 (win)
  ipcMain.handle('win:toggle-float', async () => {
    if (typeof toggleFloatWindow === 'function') {
      return await toggleFloatWindow()
    }

    console.log('[ipc] win:toggle-float (not implemented yet)')
  })

  ipcMain.handle('win:set-size', async (_event, payload) => {
    if (typeof setFloatWindowSize === 'function') {
      return await setFloatWindowSize(payload?.width, payload?.height)
    }

    console.log('[ipc] win:set-size (not implemented yet)', payload)
  })

  ipcMain.handle('win:open-main', async () => {
    if (typeof showMainWindow === 'function') {
      return await showMainWindow()
    }

    console.log('[ipc] win:open-main (not implemented yet)')
  })

  // B. 文件系统与导入 (file)
  ipcMain.handle('file:process', async (event, payload) => {
    const filePath = payload?.filePath
    let resolvedPath = typeof filePath === 'string' ? filePath : ''

    // 兼容：部分拖拽来源拿不到 File.path（例如浏览器/应用内拖拽）。
    // 这时前端会传 { fileName, data(ArrayBuffer/Uint8Array/Buffer) }，主进程先落盘再走索引。
    if (!resolvedPath) {
      const fileName = sanitizeFileName(payload?.fileName || payload?.name)
      const data = payload?.data
      if (!fileName || !data) {
        return {
          success: false,
          uuid: '',
          message: '无法获取文件路径（请从系统文件管理器拖拽本地文件）'
        }
      }

      try {
        const importsDir = join(app.getPath('userData'), 'imports')
        mkdirSync(importsDir, { recursive: true })

        const fileId = randomUUID()
        const fileDir = join(importsDir, fileId)
        mkdirSync(fileDir, { recursive: true })

        const targetPath = join(fileDir, fileName)
        writeFileSync(targetPath, toBuffer(data))
        resolvedPath = targetPath
      } catch (error) {
        return {
          success: false,
          uuid: '',
          message: `保存拖拽文件失败: ${String(error?.message || error)}`
        }
      }
    }

    const sender = event.sender
    const onProgress = (progress) => {
      try {
        sender.send('file:process-progress', progress)
      } catch {
        // 忽略发送失败（例如窗口已关闭）
      }
    }

    return await processFile(resolvedPath, onProgress)
  })

  ipcMain.handle('file:list', async (_event, payload) => {
    await initDatabase()

    const limit = Number(payload?.limit ?? 50)
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50

    const rows = db
      .prepare(
        `SELECT uuid, name, path, type, size, status, created_at
         FROM files
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(safeLimit)

    return rows
  })

  ipcMain.handle('file:open', async (_event, payload) => {
    await initDatabase()

    const uuid = String(payload?.uuid ?? '').trim()
    if (!uuid) return false

    try {
      const row = db.prepare(`SELECT path FROM files WHERE uuid = ?`).get(uuid)
      const filePath = String(row?.path ?? '').trim()
      if (!filePath) return false

      const result = await shell.openPath(filePath)
      if (result) {
        console.error('[ipc] file:open failed', result)
        return false
      }

      return true
    } catch (error) {
      console.error('[ipc] file:open failed', error)
      return false
    }
  })

  ipcMain.handle('file:delete', async (_event, payload) => {
    await initDatabase()

    const uuid = String(payload?.uuid ?? '').trim()
    if (!uuid) return { success: false, message: 'uuid 不能为空' }

    try {
      try {
        const table = await vectorStore?.openTable?.('knowledge')
        if (table?.delete) {
          const escaped = uuid.replaceAll('"', '""')
          await table.delete(`source_uuid = "${escaped}"`)
        }
      } catch (error) {
        const message = String(error?.message || error).toLowerCase()
        const notFound =
          message.includes('not found') ||
          message.includes('does not exist') ||
          message.includes('no such table') ||
          message.includes('unknown table')
        if (!notFound) throw error
      }

      db.prepare(`DELETE FROM files WHERE uuid = ?`).run(uuid)
      return { success: true }
    } catch (error) {
      console.error('[ipc] file:delete failed', error)
      return { success: false, message: String(error?.message || error) }
    }
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

      await initDatabase()

      const chunks = await search(query, 5)

      // 在开始生成前先通知前端本次检索命中的来源文件（去重，取 Top 3）
      const sourcesByUuid = new Map()
      for (const chunk of chunks) {
        const uuid = String(chunk?.source_uuid ?? '').trim()
        if (!uuid) continue

        const score =
          typeof chunk?.score === 'number' && Number.isFinite(chunk.score) ? chunk.score : null

        const existing = sourcesByUuid.get(uuid)
        if (!existing) {
          sourcesByUuid.set(uuid, { uuid, score })
          continue
        }

        if (score != null && (existing.score == null || score > existing.score)) {
          sourcesByUuid.set(uuid, { uuid, score })
        }
      }

      const sourceList = Array.from(sourcesByUuid.values())
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .slice(0, 3)

      // 无检索结果时直接返回友好提示，不调用 LLM
      if (chunks.length === 0) {
        try {
          sender.send('rag:sources', [])
        } catch {
          // 忽略发送失败
        }
        const noResultMsg =
          '我在您的笔记中没有找到与这个问题相关的内容。\n\n您可以：\n• 尝试换一种问法\n• 将相关文件拖入知识库\n• 检查知识库是否已包含相关笔记'
        sender.send('rag:chat-token', { token: noResultMsg, done: false })
        sender.send('rag:chat-token', { token: '', done: true })
        return
      }

      const nameStmt = db.prepare(`SELECT name FROM files WHERE uuid = ?`)
      const sources = sourceList.map((item) => {
        const row = nameStmt.get(item.uuid)
        return {
          fileName: String(row?.name ?? 'Unknown file'),
          uuid: item.uuid,
          score: item.score
        }
      })

      try {
        sender.send('rag:sources', sources)
      } catch {
        // 忽略发送失败（例如窗口已关闭）
      }
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
