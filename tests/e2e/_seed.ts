/**
 * tests/e2e/_seed.ts
 *
 * Seeds the wikilinks table (and required note stubs) into the E2E database.
 *
 * This helper is intentionally independent of scripts/build-backlinks.ts so
 * the E2E harness is deterministic regardless of whether D4a's pipeline is
 * present. Run via package.json `pretest:e2e`.
 *
 * Usage:
 *   MESHBLOG_DB=.data/test-e2e.db tsx tests/e2e/_seed.ts
 *
 * The script:
 *   1. Opens the DB at MESHBLOG_DB (or .data/index.db as fallback).
 *   2. Creates the wikilinks table if it doesn't exist (schema guard).
 *   3. Wipes existing wikilinks rows (idempotent re-runs).
 *   4. Inserts the fixture wikilinks matching the fixture-vault markdown files.
 *
 * NOTE: The notes themselves are already seeded by `build-index` in FIXTURE_ONLY
 * mode (which reads test/fixtures/seed.sql). This script only manages wikilinks.
 * The E2E fixture-vault notes are separate from the DB fixture notes — they exist
 * as markdown files to document the intended test structure, but the actual DB
 * rows used by E2E tests are the fixture-seed notes (fixture-ts-generics etc.)
 * plus synthetic wikilinks created here between those IDs.
 *
 * Fixture wikilink topology (using fixture note IDs from seed.sql):
 *
 *   hub    = fixture-rag-overview       (the "hub" note)
 *   child-a = fixture-ts-generics       (links to hub)
 *   child-b = fixture-sqlite-patterns   (links to hub)
 *   child-c = fixture-graph-algorithms  (links to hub)
 *   aliased = fixture-글쓰기-철학        (links to hub with alias "alternative alias")
 *   orphan  = (none — no wikilinks in/out)
 *   self    = fixture-ts-generics self-ref (must NOT appear in its own sidebar)
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DB_PATH = process.env.MESHBLOG_DB ?? '.data/index.db'
const BACKLINKS_JSON_PATH = join('public', 'graph', 'backlinks.json')

if (!existsSync(DB_PATH)) {
  console.error(`[e2e/_seed] DB not found at ${DB_PATH}. Run pretest:e2e first.`)
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = OFF')  // allow wikilinks without valid note FKs in fixture mode

// ── Ensure wikilinks table exists (matches src/lib/db/schema.sql) ────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS wikilinks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  TEXT NOT NULL,
    target_raw TEXT NOT NULL,
    target_id  TEXT,
    alias      TEXT,
    position   INTEGER NOT NULL,
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wikilinks_source ON wikilinks(source_id);
  CREATE INDEX IF NOT EXISTS idx_wikilinks_target ON wikilinks(target_id);
`)

// ── Wipe and re-seed (idempotent) ────────────────────────────────────────────
db.exec(`DELETE FROM wikilinks`)

// IDs from test/fixtures/seed.sql
const HUB_ID        = 'fixture-rag-overview'
const CHILD_A_ID    = 'fixture-ts-generics'
const CHILD_B_ID    = 'fixture-sqlite-patterns'
const CHILD_C_ID    = 'fixture-graph-algorithms'
const ALIASED_ID    = 'fixture-글쓰기-철학'
const SELF_ID       = CHILD_A_ID  // re-use child-a for the self-reference test

type WikilinkRow = {
  source_id: string
  target_id: string
  alias: string | null
  position: number
}

const rows: WikilinkRow[] = [
  // child-a → hub (no alias)
  { source_id: CHILD_A_ID,  target_id: HUB_ID, alias: null, position: 40 },
  // child-b → hub (no alias)
  { source_id: CHILD_B_ID,  target_id: HUB_ID, alias: null, position: 38 },
  // child-c → hub (no alias)
  { source_id: CHILD_C_ID,  target_id: HUB_ID, alias: null, position: 35 },
  // aliased → hub (with alias)
  { source_id: ALIASED_ID,  target_id: HUB_ID, alias: 'alternative alias', position: 10 },
  // self-reference: child-a → child-a (must be excluded from its own sidebar)
  { source_id: SELF_ID,     target_id: SELF_ID, alias: null, position: 200 },
]

const insert = db.prepare(
  `INSERT INTO wikilinks (source_id, target_raw, target_id, alias, position) VALUES (?, ?, ?, ?, ?)`
)

const insertAll = db.transaction((wikilinks: WikilinkRow[]) => {
  for (const row of wikilinks) {
    insert.run(row.source_id, row.target_id, row.target_id, row.alias, row.position)
  }
})

insertAll(rows)

const count = (db.prepare(`SELECT COUNT(*) AS n FROM wikilinks`).get() as { n: number }).n
console.log(`[e2e/_seed] Seeded ${count} wikilinks into ${DB_PATH}`)

// ── Mirror the fixture wikilinks into public/graph/backlinks.json ───────────
// scripts/build-backlinks.ts would overwrite the seeded DB rows (it deletes by
// source_id then re-parses note content), so the E2E pipeline skips it and this
// helper emits the JSON directly. The shape must match BacklinksJson in
// scripts/build-backlinks.ts so GraphView.tsx can consume it unchanged.
const uniqueIds = [...new Set(rows.flatMap((r) => [r.source_id, r.target_id]))]
const titleRows = db
  .prepare(`SELECT id, title FROM notes WHERE id IN (${uniqueIds.map(() => '?').join(',')})`)
  .all(...uniqueIds) as Array<{ id: string; title: string }>
const titleMap = new Map(titleRows.map((r) => [r.id, r.title]))

const backlinksJson = {
  nodes: uniqueIds.map((id) => ({ id, title: titleMap.get(id) ?? id })),
  edges: rows.map((r) => ({
    source: r.source_id,
    target: r.target_id,
    ...(r.alias ? { alias: r.alias } : {}),
  })),
}
mkdirSync(join('public', 'graph'), { recursive: true })
writeFileSync(BACKLINKS_JSON_PATH, JSON.stringify(backlinksJson, null, 2))
console.log(
  `[e2e/_seed] Wrote ${BACKLINKS_JSON_PATH}: ${backlinksJson.nodes.length} nodes, ${backlinksJson.edges.length} edges`,
)

db.close()
