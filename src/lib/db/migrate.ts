import type Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Current schema version. Increment when adding new tables or altering columns. */
const SCHEMA_VERSION = 4

export function applyMigrations(db: Database.Database): void {
  // WAL + busy timeout (Amendment A / DX #3)
  db.pragma("journal_mode = WAL")
  db.pragma("busy_timeout = 5000")
  db.pragma("foreign_keys = ON")

  // Create schema_version table if it doesn't exist (DX #9)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )
  `)

  const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined
  const currentVersion = row?.version ?? 0

  // Apply base schema (idempotent: all CREATE TABLE IF NOT EXISTS)
  const schemaPath = join(__dirname, "schema.sql")
  const schema = readFileSync(schemaPath, "utf-8")
  db.exec(schema)

  // Phase 1 → Phase 2 column additions (Amendment A)
  // ALTER TABLE is safe to run on an existing Phase 1 DB.
  if (currentVersion < 2) {
    const notesInfo = db.pragma("table_info(notes)") as { name: string }[]
    const notesCols = new Set(notesInfo.map((c) => c.name))

    if (!notesCols.has("graph_status")) {
      db.exec("ALTER TABLE notes ADD COLUMN graph_status TEXT NOT NULL DEFAULT 'pending'")
    }
    if (!notesCols.has("level_pin")) {
      db.exec("ALTER TABLE notes ADD COLUMN level_pin INTEGER")
    }

    // Upsert schema version
    if (currentVersion === 0) {
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION)
    } else {
      db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION)
    }
  }

  // Phase 2 → Phase 3: add content_hash to qa_cards (previously added lazily by generate-qa)
  if (currentVersion < 3) {
    const qaInfo = db.pragma("table_info(qa_cards)") as { name: string }[]
    const qaCols = new Set(qaInfo.map((c) => c.name))
    if (!qaCols.has("content_hash")) {
      db.exec("ALTER TABLE qa_cards ADD COLUMN content_hash TEXT")
    }
    db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION)
  }

  // Phase 3 → Phase 4: wikilinks table (D4 backlinks)
  // CREATE TABLE IF NOT EXISTS in schema.sql handles the actual creation;
  // this block just updates the version stamp on first upgrade.
  if (currentVersion < 4) {
    db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION)
  }
}
