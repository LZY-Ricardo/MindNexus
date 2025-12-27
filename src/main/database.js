import { app } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export let db = null
export let vectorStore = null
let ftsEnabled = false

function ensureColumn(table, column, definition) {
  const columns = db.pragma(`table_info(${table})`)
  const exists = columns.some((col) => col.name === column)
  if (exists) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

export async function initDatabase() {
  if (db && vectorStore) return { db, vectorStore }

  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })

  const sqlitePath = join(userDataPath, 'database.sqlite')
  db = new Database(sqlitePath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      type TEXT,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  ensureColumn('files', 'kb_id', "TEXT")
  ensureColumn('files', 'tags', "TEXT")

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      kb_id TEXT,
      title TEXT NOT NULL,
      model TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
  `)

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        name, content, tags
      );
    `)
    ftsEnabled = true
  } catch (error) {
    console.warn('[db] FTS5 not available, keyword search disabled', error)
    ftsEnabled = false
  }

  const defaultKb = db.prepare(`SELECT id FROM knowledge_bases WHERE is_default = 1`).get()
  if (!defaultKb) {
    db.prepare(
      `INSERT INTO knowledge_bases (id, name, description, is_default)
       VALUES (@id, @name, @description, @is_default)`
    ).run({
      id: 'default',
      name: '默认知识库',
      description: '系统默认知识库',
      is_default: 1
    })
  }

  db.prepare(`UPDATE files SET kb_id = 'default' WHERE kb_id IS NULL`).run()

  const vectorsPath = join(userDataPath, 'vectors')
  mkdirSync(vectorsPath, { recursive: true })

  const lancedb = await import('@lancedb/lancedb')
  vectorStore = await lancedb.connect(vectorsPath)

  return { db, vectorStore }
}

export function isFtsEnabled() {
  return ftsEnabled
}

export async function closeDatabase() {
  try {
    if (vectorStore?.close) {
      await vectorStore.close()
    }
  } catch (error) {
    console.warn('[db] close vectorStore failed', error)
  }

  try {
    db?.close?.()
  } catch (error) {
    console.warn('[db] close sqlite failed', error)
  }

  db = null
  vectorStore = null
}
