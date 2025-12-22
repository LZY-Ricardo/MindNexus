import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

import { db, initDatabase, vectorStore } from '../database'
import { embedText } from './embeddings'

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
    const data = await pdfParse(readFileSync(filePath))
    return data?.text ?? ''
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
 */
export async function processFile(filePath) {
  await initDatabase()

  const type = detectFileType(filePath)
  if (!type) {
    return { success: false, uuid: '', message: `不支持的文件后缀: ${extname(filePath)}` }
  }

  const fileUuid = randomUUID()
  const name = basename(filePath)

  try {
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

    const text = await extractText(filePath, type)
    const chunks = splitText(text)

    if (chunks.length === 0) {
      db.prepare(`UPDATE files SET status = @status WHERE uuid = @uuid`).run({
        uuid: fileUuid,
        status: 'indexed'
      })
      return { success: true, uuid: fileUuid }
    }

    const records = []
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]
      const vector = await embedText(chunk)
      records.push({
        id: randomUUID(),
        vector,
        text: chunk,
        source_uuid: fileUuid,
        metadata: { chunk_index: i }
      })
    }

    const { table, created } = await getOrCreateKnowledgeTable(records)
    if (!created) await table.add(records)

    db.prepare(`UPDATE files SET status = @status WHERE uuid = @uuid`).run({
      uuid: fileUuid,
      status: 'indexed'
    })

    return { success: true, uuid: fileUuid }
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
    return { success: false, uuid: fileUuid, message: String(error?.message || error) }
  }
}
