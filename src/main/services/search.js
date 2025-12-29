import { initDatabase, vectorStore, db, isFtsEnabled } from '../database'
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

function normalizeTagList(tags) {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean)
  try {
    const parsed = JSON.parse(tags)
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim()).filter(Boolean)
    }
  } catch {
    // 忽略解析失败
  }
  return []
}

function normalizeScore(score) {
  if (typeof score === 'number' && Number.isFinite(score)) {
    return Math.max(0, Math.min(1, score))
  }
  return null
}

async function semanticSearch(query, { limit, kbId } = {}) {
  const table = await openKnowledgeTable()
  if (!table) return []

  let vector
  try {
    vector = await embedText(query)
  } catch (error) {
    console.warn('[search] 向量化失败，跳过语义检索:', error.message || error)
    return []
  }

  let queryBuilder = table.vectorSearch(vector).distanceType('cosine')
  const safeKbId = kbId ? String(kbId).trim() : ''
  if (safeKbId) {
    const escaped = safeKbId.replaceAll('"', '""')
    try {
      queryBuilder = queryBuilder.where(`kb_id = "${escaped}"`)
    } catch (error) {
      console.warn('[search] 语义检索未能应用知识库过滤', error)
    }
  }

  let rows = []
  try {
    rows = await queryBuilder.select(['text', 'source_uuid']).limit(limit * 2).toArray()
  } catch (error) {
    if (!safeKbId) throw error
    const message = String(error?.message || '').toLowerCase()
    const maybeSchemaIssue =
      message.includes('column') ||
      message.includes('field') ||
      message.includes('schema') ||
      message.includes('not found')
    if (!maybeSchemaIssue) throw error
    rows = await table
      .vectorSearch(vector)
      .distanceType('cosine')
      .select(['text', 'source_uuid'])
      .limit(limit * 2)
      .toArray()
  }

  return rows.map((row) => {
    const distance =
      typeof row?._distance === 'number'
        ? row._distance
        : typeof row?.distance === 'number'
          ? row.distance
          : null
    const rawScore =
      typeof row?.score === 'number'
        ? row.score
        : typeof distance === 'number'
          ? 1 - distance
          : null

    return {
      uuid: String(row?.source_uuid ?? '').trim(),
      snippet: String(row?.text ?? ''),
      score: normalizeScore(rawScore),
      source: 'semantic'
    }
  })
}

async function keywordSearch(query, { limit, kbId } = {}) {
  if (!isFtsEnabled()) return []
  await initDatabase()

  const sql = `
    SELECT f.uuid, f.name, f.type, f.tags, f.created_at,
           snippet(files_fts, 1, '[', ']', '…', 8) AS snippet,
           bm25(files_fts) AS score
    FROM files_fts
    JOIN files f ON files_fts.rowid = f.id
    WHERE files_fts MATCH @query
    ${kbId ? 'AND f.kb_id = @kbId' : ''}
    ORDER BY score ASC
    LIMIT @limit
  `

  const params = { query, limit: limit * 2 }
  if (kbId) params.kbId = kbId
  const rows = db.prepare(sql).all(params)
  const maxScore = Math.max(...rows.map((row) => row.score || 0), 1)

  return rows.map((row) => ({
    uuid: String(row?.uuid ?? '').trim(),
    snippet: String(row?.snippet ?? ''),
    score: normalizeScore(1 - (Number(row?.score || 0) / maxScore)),
    source: 'keyword'
  }))
}

function mergeResults(semantic, keyword, weights) {
  const results = new Map()
  const { semanticWeight = 0.6, keywordWeight = 0.4 } = weights

  for (const item of semantic) {
    if (!item.uuid) continue
    results.set(item.uuid, {
      ...item,
      finalScore: (item.score ?? 0) * semanticWeight
    })
  }

  for (const item of keyword) {
    if (!item.uuid) continue
    const existing = results.get(item.uuid)
    if (existing) {
      existing.finalScore += (item.score ?? 0) * keywordWeight
      existing.snippet = existing.snippet || item.snippet
      existing.source = 'hybrid'
    } else {
      results.set(item.uuid, {
        ...item,
        finalScore: (item.score ?? 0) * keywordWeight
      })
    }
  }

  return Array.from(results.values()).sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0))
}

export async function search(query, options = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []

  const {
    mode = 'hybrid',
    limit = 5,
    kbId = null,
    types = null,
    tags = null,
    dateFrom = null,
    dateTo = null,
    semanticWeight = 0.6,
    keywordWeight = 0.4
  } = options || {}

  const normalizedTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : []

  const semantic = mode === 'semantic' || mode === 'hybrid'
    ? await semanticSearch(q, { limit, kbId })
    : []
  const keyword = mode === 'keyword' || mode === 'hybrid'
    ? await keywordSearch(q, { limit, kbId })
    : []

  const merged = mode === 'semantic'
    ? semantic
    : mode === 'keyword'
      ? keyword
      : mergeResults(semantic, keyword, { semanticWeight, keywordWeight })

  if (merged.length === 0) return []

  await initDatabase()
  const uuids = merged.map((item) => item.uuid).filter(Boolean)
  if (uuids.length === 0) return []
  const placeholders = uuids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT uuid, name, type, tags, kb_id, created_at
       FROM files
       WHERE uuid IN (${placeholders})`
    )
    .all(...uuids)

  const metaMap = new Map(rows.map((row) => [row.uuid, row]))

  const filtered = merged
    .map((item) => {
      const meta = metaMap.get(item.uuid)
      if (!meta) return null
      const tagList = normalizeTagList(meta.tags)
      return {
        uuid: item.uuid,
        name: meta.name,
        type: meta.type,
        tags: tagList,
        kb_id: meta.kb_id,
        created_at: meta.created_at,
        snippet: item.snippet,
        score: item.finalScore ?? item.score ?? null,
        source: item.source
      }
    })
    .filter(Boolean)
    .filter((item) => (kbId ? item.kb_id === kbId : true))
    .filter((item) => {
      if (Array.isArray(types) && types.length > 0) {
        return types.includes(String(item.type || ''))
      }
      return true
    })
    .filter((item) => {
      if (normalizedTags.length === 0) return true
      return normalizedTags.some((tag) => item.tags.includes(tag))
    })
    .filter((item) => {
      if (!dateFrom && !dateTo) return true
      const created = item.created_at ? new Date(item.created_at).getTime() : 0
      if (dateFrom) {
        const fromTs = new Date(dateFrom).getTime()
        if (created < fromTs) return false
      }
      if (dateTo) {
        const toTs = new Date(dateTo).getTime()
        if (created > toTs) return false
      }
      return true
    })
    .slice(0, limit)

  return filtered
}
