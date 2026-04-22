import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'

export const DB_PATH = process.env.MESHBLOG_DB ?? '.data/index.db'

export function openReadonlyDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
    db.pragma('query_only = ON')
    return db
  } catch (err) {
    console.error('[pages/db] open failed:', err)
    return null
  }
}
