import { app, ipcMain, shell } from 'electron'
import { db, initDatabase, vectorStore, closeDatabase, isFtsEnabled } from './database'
import { processFile } from './services/ingestor'
import { resetEmbeddings } from './services/embeddings'
import { search } from './services/search'
import { chatStream, generateTitle } from './services/llm'
import { mkdirSync, writeFileSync, cpSync, rmSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadConfig, getConfig, setConfig } from './config'

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

let autoBackupTimer = null
let ollamaPullInProgress = false

function getBackupRoot() {
  const root = join(app.getPath('userData'), 'backups')
  mkdirSync(root, { recursive: true })
  return root
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function listBackups() {
  const root = getBackupRoot()
  const entries = readdirSync(root, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = join(root, entry.name, 'meta.json')
      if (!existsSync(metaPath)) return null
      try {
        const raw = JSON.parse(Buffer.from(readFileSync(metaPath)).toString('utf8'))
        return { id: entry.name, ...raw }
      } catch {
        return { id: entry.name }
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
}

function copySafe(source, target) {
  if (!existsSync(source)) return
  cpSync(source, target, { recursive: true })
}

function createBackupMeta({ id, note, fileCount, kbCount }) {
  return {
    id,
    note: note || '',
    fileCount: Number(fileCount || 0),
    kbCount: Number(kbCount || 0),
    createdAt: new Date().toISOString()
  }
}

async function runBackup(note) {
  await initDatabase()
  const id = formatTimestamp()
  const root = getBackupRoot()
  const targetDir = join(root, id)
  mkdirSync(targetDir, { recursive: true })

  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // 忽略 WAL 不支持或其他错误
  }

  const dbPath = join(app.getPath('userData'), 'database.sqlite')
  const vectorsPath = join(app.getPath('userData'), 'vectors')
  copySafe(dbPath, join(targetDir, 'database.sqlite'))
  copySafe(vectorsPath, join(targetDir, 'vectors'))

  const fileCount = db.prepare(`SELECT COUNT(*) AS count FROM files`).get()?.count || 0
  const kbCount = db.prepare(`SELECT COUNT(*) AS count FROM knowledge_bases`).get()?.count || 0
  const meta = createBackupMeta({ id, note, fileCount, kbCount })
  writeFileSync(join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2))

  const config = getConfig()
  const maxCount = Number(config?.autoBackupCount || 7)
  if (Number.isFinite(maxCount) && maxCount > 0) {
    const all = listBackups()
    if (all.length > maxCount) {
      const toRemove = all.slice(maxCount)
      for (const item of toRemove) {
        rmSync(join(root, item.id), { recursive: true, force: true })
      }
    }
  }

  return meta
}

function scheduleAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }
  const config = getConfig()
  if (!config?.autoBackup) return

  const intervalSec = Number(config?.autoBackupInterval || 86400)
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return

  autoBackupTimer = setInterval(() => {
    runBackup('自动备份').catch((error) => {
      console.warn('[backup] auto backup failed', error)
    })
  }, intervalSec * 1000)
  autoBackupTimer.unref?.()
}

async function deleteFileRecord(uuid) {
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

    const row = db.prepare(`SELECT id FROM files WHERE uuid = ?`).get(uuid)
    if (row?.id && isFtsEnabled()) {
      try {
        db.prepare(`DELETE FROM files_fts WHERE rowid = ?`).run(row.id)
      } catch (error) {
        console.warn('[ipc] delete fts failed', error)
      }
    }

    db.prepare(`DELETE FROM files WHERE uuid = ?`).run(uuid)
    return { success: true }
  } catch (error) {
    console.error('[ipc] file:delete failed', error)
    return { success: false, message: String(error?.message || error) }
  }
}

export function setupIPC({ toggleFloatWindow, setFloatWindowSize, showMainWindow } = {}) {
  console.log('[ipc] setupIPC 被调用')

  // 移除旧处理器（如果存在），然后重新注册
  // 这样可以支持热重载
  void loadConfig().then(scheduleAutoBackup)

  // A. 窗口管理 (win)
  ipcMain.removeHandler('win:toggle-float')
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
    const kbId = payload?.kbId
    const tags = payload?.tags

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

    return await processFile(resolvedPath, { kbId, tags }, onProgress)
  })

  ipcMain.handle('file:list', async (_event, payload) => {
    await initDatabase()

    const limit = Number(payload?.limit ?? 50)
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50
    const kbId = String(payload?.kbId ?? '').trim()
    const status = String(payload?.status ?? '').trim()

    let sql = `
      SELECT uuid, name, path, type, size, status, created_at, kb_id, tags
      FROM files
      WHERE 1=1
    `
    const params = {}

    if (kbId) {
      sql += ` AND kb_id = @kbId`
      params.kbId = kbId
    }
    if (status) {
      sql += ` AND status = @status`
      params.status = status
    }

    sql += ` ORDER BY created_at DESC LIMIT @limit`
    params.limit = safeLimit

    return db.prepare(sql).all(params)
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
    return await deleteFileRecord(uuid)
  })

  ipcMain.handle('file:move', async (_event, payload) => {
    await initDatabase()
    const uuid = String(payload?.uuid ?? '').trim()
    const kbId = String(payload?.kbId ?? '').trim()
    if (!uuid || !kbId) return { success: false, message: '参数不完整' }

    db.prepare(`UPDATE files SET kb_id = @kbId WHERE uuid = @uuid`).run({ kbId, uuid })
    return { success: true }
  })

  ipcMain.handle('file:set-tags', async (_event, payload) => {
    await initDatabase()
    const uuid = String(payload?.uuid ?? '').trim()
    const tags = Array.isArray(payload?.tags) ? payload.tags : []
    if (!uuid) return { success: false, message: 'uuid 不能为空' }
    const tagsJson = JSON.stringify(tags.map((t) => String(t).trim()).filter(Boolean))

    db.prepare(`UPDATE files SET tags = @tags WHERE uuid = @uuid`).run({ tags: tagsJson, uuid })

    if (isFtsEnabled()) {
      const row = db.prepare(`SELECT id FROM files WHERE uuid = ?`).get(uuid)
      if (row?.id) {
        try {
          db.prepare(`UPDATE files_fts SET tags = @tags WHERE rowid = @rowid`).run({
            tags: tagsJson,
            rowid: row.id
          })
        } catch (error) {
          console.warn('[ipc] update fts tags failed', error)
        }
      }
    }

    return { success: true }
  })

  ipcMain.handle('kb:list', async () => {
    await initDatabase()
    return db
      .prepare(
        `SELECT kb.id, kb.name, kb.description, kb.color, kb.created_at, kb.is_default,
                COUNT(f.uuid) AS file_count
         FROM knowledge_bases kb
         LEFT JOIN files f ON f.kb_id = kb.id
         GROUP BY kb.id
         ORDER BY kb.created_at DESC`
      )
      .all()
  })

  ipcMain.handle('kb:create', async (_event, payload) => {
    await initDatabase()
    const name = String(payload?.name ?? '').trim()
    if (!name) return { success: false, message: '名称不能为空' }
    const id = randomUUID()
    const description = String(payload?.description ?? '').trim()
    const color = String(payload?.color ?? '').trim() || '#6366f1'
    db.prepare(
      `INSERT INTO knowledge_bases (id, name, description, color)
       VALUES (@id, @name, @description, @color)`
    ).run({ id, name, description, color })
    return { success: true, id }
  })

  ipcMain.handle('kb:update', async (_event, payload) => {
    await initDatabase()
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    const name = String(payload?.name ?? '').trim()
    const description = String(payload?.description ?? '').trim()
    const color = String(payload?.color ?? '').trim()

    db.prepare(
      `UPDATE knowledge_bases
       SET name = @name, description = @description, color = @color
       WHERE id = @id`
    ).run({ id, name, description, color })
    return { success: true }
  })

  ipcMain.handle('kb:set-default', async (_event, payload) => {
    await initDatabase()
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    db.prepare(`UPDATE knowledge_bases SET is_default = 0`).run()
    db.prepare(`UPDATE knowledge_bases SET is_default = 1 WHERE id = @id`).run({ id })
    return { success: true }
  })

  ipcMain.handle('kb:delete', async (_event, payload) => {
    await initDatabase()
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    const moveTo = String(payload?.moveTo ?? '').trim()

    if (moveTo) {
      db.prepare(`UPDATE files SET kb_id = @moveTo WHERE kb_id = @id`).run({ moveTo, id })
    } else {
      const rows = db.prepare(`SELECT uuid FROM files WHERE kb_id = ?`).all(id)
      for (const row of rows) {
        const uuid = String(row?.uuid ?? '').trim()
        if (uuid) {
          await deleteFileRecord(uuid)
        }
      }
    }

    db.prepare(`DELETE FROM knowledge_bases WHERE id = ?`).run(id)
    return { success: true }
  })

  ipcMain.handle('session:list', async () => {
    await initDatabase()
    return db
      .prepare(
        `SELECT s.*, COUNT(m.id) AS message_count
         FROM chat_sessions s
         LEFT JOIN chat_messages m ON m.session_id = s.id
         GROUP BY s.id
         ORDER BY s.updated_at DESC`
      )
      .all()
  })

  ipcMain.handle('session:create', async (_event, payload) => {
    await initDatabase()
    const id = randomUUID()
    const kbId = String(payload?.kbId ?? '').trim() || null
    const model = String(payload?.model ?? '').trim() || null
    const title = String(payload?.title ?? '').trim() || `新对话 ${new Date().toLocaleTimeString()}`
    db.prepare(
      `INSERT INTO chat_sessions (id, kb_id, title, model)
       VALUES (@id, @kb_id, @title, @model)`
    ).run({ id, kb_id: kbId, title, model })
    return { success: true, session: { id, kb_id: kbId, title, model } }
  })

  ipcMain.handle('session:update', async (_event, payload) => {
    await initDatabase()
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    const titleRaw = payload?.title
    const modelRaw = payload?.model
    const kbRaw = payload?.kbId
    const title = titleRaw == null ? null : String(titleRaw).trim()
    const model = modelRaw == null ? null : String(modelRaw).trim()
    const kbId = kbRaw == null ? null : String(kbRaw).trim()
    db.prepare(
      `UPDATE chat_sessions
       SET title = COALESCE(@title, title),
           model = COALESCE(@model, model),
           kb_id = COALESCE(@kb_id, kb_id),
           updated_at = strftime('%s', 'now')
       WHERE id = @id`
    ).run({
      id,
      title: title || null,
      model: model || null,
      kb_id: kbId || null
    })
    return { success: true }
  })

  ipcMain.handle('session:delete', async (_event, payload) => {
    await initDatabase()
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    db.prepare(`DELETE FROM chat_messages WHERE session_id = @id`).run({ id })
    db.prepare(`DELETE FROM chat_sessions WHERE id = @id`).run({ id })
    return { success: true }
  })

  ipcMain.handle('session:messages', async (_event, payload) => {
    await initDatabase()
    const sessionId = String(payload?.sessionId ?? '').trim()
    if (!sessionId) return []
    return db
      .prepare(
        `SELECT id, role, content, sources, created_at
         FROM chat_messages
         WHERE session_id = @sessionId
         ORDER BY created_at ASC`
      )
      .all({ sessionId })
  })

  ipcMain.handle('session:add-message', async (_event, payload) => {
    await initDatabase()
    const sessionId = String(payload?.sessionId ?? '').trim()
    const role = String(payload?.role ?? '').trim()
    const content = String(payload?.content ?? '')
    const sources = payload?.sources ? JSON.stringify(payload.sources) : null
    if (!sessionId || !role) return { success: false, message: '参数不完整' }
    const id = randomUUID()
    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, sources)
       VALUES (@id, @sessionId, @role, @content, @sources)`
    ).run({ id, sessionId, role, content, sources })
    db.prepare(`UPDATE chat_sessions SET updated_at = strftime('%s', 'now') WHERE id = @id`).run({
      id: sessionId
    })
    return { success: true, id }
  })

  ipcMain.handle('session:update-message', async (_event, payload) => {
    await initDatabase()
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    const content = String(payload?.content ?? '')
    const sources = payload?.sources ? JSON.stringify(payload.sources) : null
    db.prepare(
      `UPDATE chat_messages SET content = @content, sources = @sources WHERE id = @id`
    ).run({ id, content, sources })
    return { success: true }
  })

  ipcMain.handle('settings:get', async () => {
    await loadConfig()
    return getConfig()
  })

  ipcMain.handle('settings:set', async (_event, payload) => {
    const next = await setConfig(payload)
    resetEmbeddings()
    scheduleAutoBackup()
    return { success: true, config: next }
  })

    ipcMain.handle('ollama:check', async () => {
      console.log('[ipc] ollama:check 处理器被调用')
      const config = getConfig()
      const baseUrl = String(config?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')
      const url = `${baseUrl}/api/tags`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(url, {
        signal: controller.signal
      })

      clearTimeout(timeout)
      return { connected: response.ok }
    } catch {
      return { connected: false }
      }
    })

    ipcMain.handle('ollama:list-models', async () => {
      const config = getConfig()
      const baseUrl = String(config?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')
      const url = `${baseUrl}/api/tags`

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)

        if (!response.ok) {
          return { connected: false, models: [], status: response.status }
        }

        const data = await response.json().catch(() => null)
        const rawModels = Array.isArray(data?.models) ? data.models : []

        const models = rawModels
          .map((item) => ({
            name: String(item?.name ?? '').trim(),
            size: typeof item?.size === 'number' && Number.isFinite(item.size) ? item.size : null,
            modifiedAt: item?.modified_at ? String(item.modified_at) : null,
            digest: item?.digest ? String(item.digest) : null
          }))
          .filter((m) => m.name)
          .sort((a, b) => a.name.localeCompare(b.name))

        return { connected: true, models }
      } catch {
        return { connected: false, models: [] }
      }
    })

    ipcMain.handle('ollama:open-download', async () => {
      await shell.openExternal('https://ollama.com/download')
      return true
    })

    ipcMain.handle('ollama:pull-start', async (event, payload) => {
      const model = String(payload?.model ?? '').trim()
      if (!model) return { success: false, message: 'model 不能为空' }
      if (ollamaPullInProgress) return { success: false, message: '已有拉取任务正在进行' }

      const sender = event.sender
      const config = getConfig()
      const baseUrl = String(config?.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')
      const url = `${baseUrl}/api/pull`

      ollamaPullInProgress = true

      void (async () => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model, stream: true })
          })

          if (!response.ok) {
            const text = await response.text().catch(() => '')
            sender.send('ollama:pull-progress', {
              model,
              done: true,
              error: `Ollama 拉取失败: ${response.status} ${response.statusText} ${text}`.trim()
            })
            return
          }

          if (!response.body) {
            sender.send('ollama:pull-progress', {
              model,
              done: true,
              error: 'Ollama 响应缺少 body（无法流式读取）'
            })
            return
          }

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

              sender.send('ollama:pull-progress', { model, ...json, done: false })
            }
          }

          const tail = buffer.trim()
          if (tail) {
            try {
              const json = JSON.parse(tail)
              sender.send('ollama:pull-progress', { model, ...json, done: false })
            } catch {
              // 忽略尾部残片
            }
          }

          sender.send('ollama:pull-progress', { model, done: true, status: 'done' })
        } catch (error) {
          sender.send('ollama:pull-progress', { model, done: true, error: String(error?.message || error) })
        } finally {
          ollamaPullInProgress = false
        }
      })()

      return { success: true }
    })
  
    // 生成会话标题
    ipcMain.handle('llm:generate-title', async (_event, payload) => {
      const firstMessage = String(payload?.firstMessage ?? '').trim()
      const model = String(payload?.model ?? '')
    if (!firstMessage) throw new Error('firstMessage 不能为空')
    return await generateTitle(firstMessage, model)
  })

  ipcMain.handle('analytics:overview', async () => {
    await initDatabase()
    const total = db.prepare(`SELECT COUNT(*) AS count FROM files`).get()?.count || 0
    const indexed = db
      .prepare(`SELECT COUNT(*) AS count FROM files WHERE status = 'indexed'`)
      .get()?.count || 0
    const failed = db
      .prepare(`SELECT COUNT(*) AS count FROM files WHERE status = 'error'`)
      .get()?.count || 0
    const totalSize = db.prepare(`SELECT SUM(size) AS total FROM files`).get()?.total || 0
    const sessionCount = db.prepare(`SELECT COUNT(*) AS count FROM chat_sessions`).get()?.count || 0
    const messageCount = db.prepare(`SELECT COUNT(*) AS count FROM chat_messages`).get()?.count || 0

    const byType = db
      .prepare(
        `SELECT type, COUNT(*) AS count
         FROM files
         GROUP BY type
         ORDER BY count DESC`
      )
      .all()

    const byKb = db
      .prepare(
        `SELECT kb_id AS id, COUNT(*) AS count
         FROM files
         GROUP BY kb_id
         ORDER BY count DESC`
      )
      .all()

    return {
      total,
      indexed,
      failed,
      totalSize,
      sessionCount,
      messageCount,
      byType,
      byKb
    }
  })

  ipcMain.handle('search:query', async (_event, payload) => {
    const query = String(payload?.query ?? '').trim()
    const options = payload?.options ?? {}
    return await search(query, options)
  })

  ipcMain.handle('backup:list', async () => {
    return listBackups()
  })

  ipcMain.handle('backup:create', async (_event, payload) => {
    const note = String(payload?.note ?? '').trim()
    const meta = await runBackup(note)
    return { success: true, backup: meta }
  })

  ipcMain.handle('backup:restore', async (_event, payload) => {
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    const root = getBackupRoot()
    const sourceDir = join(root, id)
    if (!existsSync(sourceDir)) return { success: false, message: '备份不存在' }

    await closeDatabase()

    const dbPath = join(app.getPath('userData'), 'database.sqlite')
    const vectorsPath = join(app.getPath('userData'), 'vectors')
    rmSync(dbPath, { force: true })
    rmSync(vectorsPath, { recursive: true, force: true })

    copySafe(join(sourceDir, 'database.sqlite'), dbPath)
    copySafe(join(sourceDir, 'vectors'), vectorsPath)

    app.relaunch()
    app.exit(0)
    return { success: true }
  })

  ipcMain.handle('backup:delete', async (_event, payload) => {
    const id = String(payload?.id ?? '').trim()
    if (!id) return { success: false, message: 'ID 不能为空' }
    const root = getBackupRoot()
    const target = join(root, id)
    rmSync(target, { recursive: true, force: true })
    return { success: true }
  })

  // C. 知识库与 AI (rag)
  ipcMain.handle('rag:search', async (_event, payload) => {
    const query = payload?.query ?? ''
    const limit = Number(payload?.limit ?? 5)
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 5
    const kbId = String(payload?.kbId ?? '').trim() || null
    return await search(query, { limit: safeLimit, kbId, mode: 'semantic' })
  })

  ipcMain.handle('rag:chat-start', (event, payload) => {
    const sender = event.sender

    void (async () => {
      const query = String(payload?.query ?? '').trim()
      const config = getConfig()
      const kbId = String(payload?.kbId ?? '').trim() || null
      const sessionId = String(payload?.sessionId ?? '').trim()
      const model = String(payload?.model ?? config?.ollamaModel ?? 'llama3')
      const historyPayload = Array.isArray(payload?.history) ? payload.history : []

      await initDatabase()

      let history = historyPayload
      if (sessionId) {
        const rows = db
          .prepare(
            `SELECT role, content
             FROM chat_messages
             WHERE session_id = @sessionId
             ORDER BY created_at ASC`
          )
          .all({ sessionId })
        const limit = Number(config?.sessionHistoryLimit || 50)
        history = rows.slice(-limit).map((row) => ({
          role: String(row?.role ?? 'user'),
          content: String(row?.content ?? '')
        }))
      }

      const lastHistory = history[history.length - 1]
      if (lastHistory?.role === 'user' && lastHistory.content?.trim() === query) {
        history = history.slice(0, -1)
      }
      history = history.filter((item) => String(item?.content ?? '').trim())

      const chunks = await search(query, { limit: 5, kbId, mode: 'semantic' })

      // 在开始生成前先通知前端本次检索命中的来源文件（去重，取 Top 3）
      const sourcesByUuid = new Map()
      for (const chunk of chunks) {
        const uuid = String(chunk?.uuid ?? '').trim()
        if (!uuid) continue

        const score =
          typeof chunk?.score === 'number' && Number.isFinite(chunk.score) ? chunk.score : null
        const fileName = String(chunk?.name ?? '').trim()

        const existing = sourcesByUuid.get(uuid)
        if (!existing) {
          sourcesByUuid.set(uuid, { uuid, score, fileName })
          continue
        }

        if (score != null && (existing.score == null || score > existing.score)) {
          sourcesByUuid.set(uuid, { uuid, score, fileName })
        }
      }

      const sourceList = Array.from(sourcesByUuid.values())
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .slice(0, 3)

      // 计算最高相似度分数，判断检索质量
      const maxScore = chunks.length > 0
        ? Math.max(...chunks.map(c => typeof c?.score === 'number' ? c.score : 0))
        : 0
      const hasRelevantContent = chunks.length > 0 && maxScore > 0.5 // 相似度阈值 0.5（提高门槛以减少无关结果）

      // 无有效检索结果时直接返回友好提示，不调用 LLM
      if (!hasRelevantContent) {
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

      const sources = sourceList.map((item) => ({
        fileName: String(item.fileName || 'Unknown file'),
        uuid: item.uuid,
        score: item.score
      }))

      try {
        sender.send('rag:sources', sources)
      } catch {
        // 忽略发送失败（例如窗口已关闭）
      }
      const prompt = [
        '你是一个专业的知识助手，基于用户的笔记和文档来回答问题。',
        '请使用中文回答。',
        '',
        '以下是相关的参考资料：',
        '---',
        chunks.map((c) => c.snippet).join('\n---\n'),
        '---',
        '',
        `用户问题：${query}`,
        '',
        '请根据上述参考资料回答问题。如果参考资料中没有足够的信息来回答这个问题，请诚实地告诉用户"根据我的知识库，暂时没有找到与此问题直接相关的内容"，并建议用户可以补充相关资料。'
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
