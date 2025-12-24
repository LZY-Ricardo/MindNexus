import { initDatabase, vectorStore } from '../database'
import { embedText } from './embeddings'

async function openKnowledgeTable() {
  await initDatabase()
  if (!vectorStore) throw new Error('LanceDB 未初始化')

  try {
    return await vectorStore.openTable('knowledge')
  } catch (error) {
    const message = String(error?.message || error).toLowerCase()
    const notFound =
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('no such table') ||
      message.includes('unknown table')
    if (notFound) return null
    throw error
  }
}

/**
 * 语义搜索：query 向量化后做向量检索。
 * @param {string} query
 * @param {number} limit
 */
export async function search(query, limit = 5) {
  const q = String(query ?? '').trim()
  if (!q) return []

  const table = await openKnowledgeTable()
  if (!table) return []

  const vector = await embedText(q)

  const rows = await table
    .vectorSearch(vector)
    .distanceType('cosine')
    .select(['text', 'source_uuid'])
    .limit(limit)
    .toArray()

  return rows.map((row) => {
    const distance =
      typeof row?._distance === 'number'
        ? row._distance
        : typeof row?.distance === 'number'
          ? row.distance
          : null

    let score = null
    if (typeof row?.score === 'number') score = row.score
    else if (typeof distance === 'number') score = 1 - distance

    if (typeof score === 'number' && Number.isFinite(score)) {
      score = Math.max(0, Math.min(1, score))
    } else {
      score = null
    }

    return {
      text: String(row?.text ?? ''),
      score,
      source_uuid: String(row?.source_uuid ?? '').trim()
    }
  })
}
