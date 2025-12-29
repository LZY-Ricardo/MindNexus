import { initDatabase, db } from './database'

const DEFAULT_CONFIG = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  embeddingsBackend: 'ollama',
  embeddingsModel: 'nomic-embed-text:latest',
  defaultSearchMode: 'hybrid',
  sessionHistoryLimit: 50,
  autoBackup: false,
  autoBackupInterval: 86400,
  autoBackupCount: 7,
  floatWindowX: null,
  floatWindowY: null
}

const CONFIG_TYPES = {
  ollamaUrl: 'string',
  ollamaModel: 'string',
  embeddingsBackend: 'string',
  embeddingsModel: 'string',
  defaultSearchMode: 'string',
  sessionHistoryLimit: 'number',
  autoBackup: 'boolean',
  autoBackupInterval: 'number',
  autoBackupCount: 'number',
  floatWindowX: 'number',
  floatWindowY: 'number'
}

let configCache = { ...DEFAULT_CONFIG }

function parseValue(key, raw) {
  if (raw == null) return undefined
  const type = CONFIG_TYPES[key]
  if (type === 'number') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
  if (type === 'boolean') {
    if (raw === 'true' || raw === true) return true
    if (raw === 'false' || raw === false) return false
    return undefined
  }
  return String(raw)
}

export async function loadConfig() {
  await initDatabase()
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key)
    const parsed = parseValue(key, row?.value)
    if (parsed !== undefined) {
      configCache[key] = parsed
    }
  }
  return configCache
}

export function getConfig() {
  return configCache
}

export async function setConfig(partial) {
  await initDatabase()
  const updates = partial && typeof partial === 'object' ? partial : {}

  const stmt = db.prepare(`INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)

  for (const [key, value] of Object.entries(updates)) {
    if (!(key in DEFAULT_CONFIG)) continue
    const parsed = parseValue(key, value)
    if (parsed === undefined) continue
    configCache[key] = parsed
    stmt.run({ key, value: String(parsed) })
  }

  return configCache
}
