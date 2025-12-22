import { app } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export let db = null
export let vectorStore = null

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

  const vectorsPath = join(userDataPath, 'vectors')
  mkdirSync(vectorsPath, { recursive: true })

  const lancedb = await import('@lancedb/lancedb')
  vectorStore = await lancedb.connect(vectorsPath)

  return { db, vectorStore }
}
