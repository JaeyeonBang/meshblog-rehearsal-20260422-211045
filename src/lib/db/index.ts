import Database from "better-sqlite3"
import { applyMigrations } from "./migrate"

export function createDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  applyMigrations(db)
  return db
}

export function queryOne<T = Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  params: unknown[],
): T | null {
  const stmt = db.prepare(sql)
  return (stmt.get(...params) as T) ?? null
}

export function queryMany<T = Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  params: unknown[],
): T[] {
  const stmt = db.prepare(sql)
  return stmt.all(...params) as T[]
}

export function execute(
  db: Database.Database,
  sql: string,
  params: unknown[],
): { changes: number; lastInsertRowid: number | bigint } {
  const stmt = db.prepare(sql)
  return stmt.run(...params)
}

export type { Database }
