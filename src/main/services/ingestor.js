import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

import { db, initDatabase, vectorStore } from '../database'
import { embedText, initEmbeddings } from './embeddings'

/**
 * @typedef {Object} IngestProgress
 * @property {string} stage 阶段标识（用于前端展示/定位卡点）
 * @property {number} progress 当前文件进度（0-100）
 * @property {string} uuid 文件 UUID
 * @property {string} filePath 文件路径
 * @property {string} [message] 可读提示
 * @property {number} [current] 当前计数（如 chunk 序号）
 * @property {number} [total] 总计数（如 chunk 总数）
 */

/**
 * 严格按 docs/4_business_logic.md 实现：
 * - chunkSize=500
 * - overlap=50
 * - 在末尾 50 字符窗口内优先在 '.' 或 '\n' 截断，避免切断句子
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {string[]}
 */
export function splitText(text, chunkSize = 500, overlap = 50) {
  if (!text) return []

  const normalized = String(text).replaceAll('\r\n', '\n')
  const chunks = []

  let currentIndex = 0
  while (currentIndex < normalized.length) {
    const sliceEnd = Math.min(currentIndex + chunkSize, normalized.length)
    let endIndex = sliceEnd

    const searchStart = Math.max(currentIndex, sliceEnd - 50)
    const windowText = normalized.slice(searchStart, sliceEnd)
    const lastPeriod = windowText.lastIndexOf('.')
    const lastNewline = windowText.lastIndexOf('\n')
    const lastBreak = Math.max(lastPeriod, lastNewline)

    if (lastBreak !== -1 && sliceEnd !== normalized.length) {
      endIndex = searchStart + lastBreak + 1
    }

    const chunk = normalized.slice(currentIndex, endIndex).trim()
    if (chunk) chunks.push(chunk)

    currentIndex += chunkSize - overlap
  }

  return chunks
}

function detectFileType(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.md') return 'md'
  if (ext === '.txt') return 'txt'
  return null
}

async function extractText(filePath, type) {
  if (type === 'pdf') {
    const parser = new PDFParse({ data: readFileSync(filePath) })
    try {
      const result = await parser.getText()
      return result?.text ?? ''
    } finally {
      try {
        await parser.destroy()
      } catch {
        // 忽略销毁失败
      }
    }
  }

  if (type === 'docx') {
    const result = await mammoth.extractRawText({ path: filePath })
    return result?.value ?? ''
  }

  if (type === 'md' || type === 'txt') {
    return readFileSync(filePath, 'utf8')
  }

  throw new Error(`不支持的文件类型: ${type}`)
}

async function getOrCreateKnowledgeTable(initialRecords) {
  if (!vectorStore) throw new Error('LanceDB 未初始化')

  try {
    const table = await vectorStore.openTable('knowledge')
    return { table, created: false }
  } catch (error) {
    const message = String(error?.message || error).toLowerCase()
    const notFound =
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('no such table') ||
      message.includes('unknown table')

    if (!notFound) throw error

    if (!initialRecords || initialRecords.length === 0) {
      throw new Error('knowledge 表不存在，且没有可用于建表的初始数据')
    }

    const table = await vectorStore.createTable('knowledge', initialRecords, { mode: 'create' })
    return { table, created: true }
  }
}

/**
 * 按 docs/4_business_logic.md 摄入流程实现：
 * - 写入 SQLite(files,status=processing)
 * - 文本抽取 -> split -> embedding
 * - 批量写入 LanceDB knowledge
 * - status=indexed（异常则 status=error）
 * @param {string} filePath
 * @param {(progress: IngestProgress) => void} [onProgress]
 */
export async function processFile(filePath, onProgress) {
  const type = detectFileType(filePath)
  if (!type) {
    return {
      success: false,
      uuid: '',
      chunks: 0,
      message: `不支持的文件后缀: ${extname(filePath)}`
    }
  }

  const fileUuid = randomUUID()
  const name = basename(filePath)

  try {
    const safeReport = (partial) => {
      if (typeof onProgress !== 'function') return
      try {
        onProgress({
          stage: String(partial?.stage ?? 'unknown'),
          progress: Number(partial?.progress ?? 0),
          uuid: fileUuid,
          filePath,
          message: partial?.message ? String(partial.message) : undefined,
          current: Number.isFinite(partial?.current) ? Number(partial.current) : undefined,
          total: Number.isFinite(partial?.total) ? Number(partial.total) : undefined
        })
      } catch {
        // 忽略进度回调异常，避免中断主流程
      }
    }

    safeReport({ stage: 'db_init', progress: 1, message: '初始化数据库' })
    try {
      await initDatabase()
    } catch (error) {
      const msg = String(error?.message || error)
      safeReport({ stage: 'error', progress: 1, message: `数据库初始化失败: ${msg}` })
      return { success: false, uuid: fileUuid, chunks: 0, message: msg }
    }
    safeReport({ stage: 'db_ready', progress: 5, message: '数据库就绪' })

    const stat = statSync(filePath)

    db.prepare(
      `INSERT INTO files (uuid, name, path, type, size, status)
       VALUES (@uuid, @name, @path, @type, @size, @status)`
    ).run({
      uuid: fileUuid,
      name,
      path: filePath,
      type,
      size: stat.size,
      status: 'processing'
    })

    safeReport({ stage: 'metadata', progress: 10, message: '写入文件元数据' })

    const text = await extractText(filePath, type)
    safeReport({ stage: 'extract', progress: 25, message: '文本提取完成' })
    const chunks = splitText(text)
    safeReport({ stage: 'split', progress: 35, message: `文本切分完成（${chunks.length} 段）` })

    if (chunks.length === 0) {
      db.prepare(`UPDATE files SET status = @status WHERE uuid = @uuid`).run({
        uuid: fileUuid,
        status: 'error'
      })
      safeReport({
        stage: 'error',
        progress: 100,
        message: '未提取到可索引文本（例如：扫描版 PDF / 图片型文档）'
      })
      return {
        success: false,
        uuid: fileUuid,
        chunks: 0,
        message: '未提取到可索引文本（例如：扫描版 PDF / 图片型文档）'
      }
    }

    safeReport({ stage: 'embed_init', progress: 40, message: '初始化向量服务' })
    const embeddingBackend = await initEmbeddings()
    safeReport({
      stage: 'embed_ready',
      progress: 45,
      message: `向量服务就绪（${embeddingBackend === 'ollama' ? 'Ollama embeddings' : 'Transformers.js'}）`
    })

    const batchSize = 32
    const notifyEvery = Math.max(1, Math.floor(chunks.length / 20))
    let table = null
    let tableCreated = false
    let batch = []

    const flushBatch = async () => {
      if (!batch.length) return

      if (!table) {
        const res = await getOrCreateKnowledgeTable(batch)
        table = res.table
        tableCreated = res.created
        if (!tableCreated) await table.add(batch)
      } else {
        await table.add(batch)
      }

      batch = []
    }

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]
      const vector = await embedText(chunk)
      batch.push({
        id: randomUUID(),
        vector,
        text: chunk,
        source_uuid: fileUuid,
        metadata: { chunk_index: i }
      })

      if (batch.length >= batchSize) {
        await flushBatch()
      }

      const doneCount = i + 1
      if (doneCount === 1 || doneCount % notifyEvery === 0 || doneCount === chunks.length) {
        const embedProgress = Math.round((doneCount / chunks.length) * 40)
        safeReport({
          stage: 'embedding',
          progress: 45 + embedProgress,
          current: doneCount,
          total: chunks.length,
          message: `向量化中（${doneCount}/${chunks.length}）`
        })
      }
    }

    safeReport({ stage: 'lancedb_write', progress: 90, message: '写入向量库' })
    await flushBatch()
    safeReport({ stage: 'lancedb_done', progress: 95, message: '向量库写入完成' })

    db.prepare(`UPDATE files SET status = @status WHERE uuid = @uuid`).run({
      uuid: fileUuid,
      status: 'indexed'
    })

    safeReport({ stage: 'done', progress: 100, message: '索引完成' })
    return { success: true, uuid: fileUuid, chunks: chunks.length }
  } catch (error) {
    try {
      db.prepare(`UPDATE files SET status = @status WHERE uuid = @uuid`).run({
        uuid: fileUuid,
        status: 'error'
      })
    } catch {
      // 忽略二次失败
    }

    console.error('[ingestor] processFile failed', error)
    const msg = String(error?.message || error)
    try {
      onProgress?.({ stage: 'error', progress: 100, uuid: fileUuid, filePath, message: msg })
    } catch {
      // 忽略二次失败
    }
    return {
      success: false,
      uuid: fileUuid,
      chunks: 0,
      message: msg
    }
  }
}
