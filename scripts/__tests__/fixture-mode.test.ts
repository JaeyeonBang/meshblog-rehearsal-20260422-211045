/**
 * fixture-mode.test.ts — Task 0.5: FIXTURE_ONLY mode integration test.
 *
 * Verifies that:
 *  1. `FIXTURE_ONLY=1 bun run build-index` seeds DB from test/fixtures/seed.sql
 *     with the correct row counts and all required tables.
 *  2. `FIXTURE_ONLY=1 bun run generate-qa` exits 0 and does NOT add new qa_cards.
 *
 * Safety: uses a dedicated test DB path, never touches .data/index.db.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, unlinkSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { createDb } from "../../src/lib/db/index.ts"

const REPO_ROOT = join(import.meta.dirname, "../..")
const TEST_DB = join(REPO_ROOT, ".data/test-fixture-mode.db")

function runCmd(cmd: string): string {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, MESHBLOG_DB: TEST_DB, FIXTURE_ONLY: "1" },
    encoding: "utf-8",
  })
}

describe("FIXTURE_ONLY mode", () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    // Cleanup WAL/SHM sidecar files if present
    for (const ext of ["-shm", "-wal"]) {
      const f = TEST_DB + ext
      if (existsSync(f)) unlinkSync(f)
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    for (const ext of ["-shm", "-wal"]) {
      const f = TEST_DB + ext
      if (existsSync(f)) unlinkSync(f)
    }
  })

  it("build-index exits 0 and seeds DB with correct row counts", { timeout: 30000 }, () => {
    const output = runCmd("bun run build-index")

    expect(output).toContain("FIXTURE_ONLY=1")
    expect(output).toContain("fixture seed complete")

    expect(existsSync(TEST_DB)).toBe(true)

    const db = createDb(TEST_DB)
    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM notes)                AS notes,
          (SELECT COUNT(*) FROM entities)             AS entities,
          (SELECT COUNT(*) FROM note_entities)        AS note_entities,
          (SELECT COUNT(*) FROM entity_relationships) AS entity_rels,
          (SELECT COUNT(*) FROM note_embeddings)      AS embeddings,
          (SELECT COUNT(*) FROM concepts)             AS concepts,
          (SELECT COUNT(*) FROM concept_entities)     AS concept_entities,
          (SELECT COUNT(*) FROM qa_cards)             AS qa_cards`,
      )
      .get() as Record<string, number>
    db.close()

    expect(counts.notes).toBeGreaterThanOrEqual(5)
    expect(counts.entities).toBeGreaterThanOrEqual(15)
    expect(counts.qa_cards).toBeGreaterThanOrEqual(20)
  })

  it("all 9 required tables exist in the seeded DB", { timeout: 30000 }, () => {
    runCmd("bun run build-index")

    const db = createDb(TEST_DB)
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name)
    db.close()

    const required = [
      "notes",
      "entities",
      "note_entities",
      "entity_relationships",
      "note_embeddings",
      "concepts",
      "concept_entities",
      "qa_cards",
      "graph_levels",
    ]
    for (const t of required) {
      expect(tables, `table "${t}" must exist`).toContain(t)
    }
  })

  it("generate-qa exits 0 and does not add new qa_cards", { timeout: 30000 }, () => {
    runCmd("bun run build-index")

    const db = createDb(TEST_DB)
    const before = (
      db.prepare("SELECT COUNT(*) AS n FROM qa_cards").get() as { n: number }
    ).n
    db.close()

    const output = runCmd("bun run generate-qa")
    expect(output).toContain("FIXTURE_ONLY=1")
    expect(output).toContain("skipping")

    const db2 = createDb(TEST_DB)
    const after = (
      db2.prepare("SELECT COUNT(*) AS n FROM qa_cards").get() as { n: number }
    ).n
    db2.close()

    expect(after).toBe(before)
  })

  it("build-index is idempotent: running twice yields same counts", { timeout: 45000 }, () => {
    runCmd("bun run build-index")

    const db1 = createDb(TEST_DB)
    const c1 = (db1.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n
    const q1 = (db1.prepare("SELECT COUNT(*) AS n FROM qa_cards").get() as { n: number }).n
    db1.close()

    // Re-run: seed.sql starts with DELETEs so it re-seeds cleanly
    runCmd("bun run build-index")

    const db2 = createDb(TEST_DB)
    const c2 = (db2.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n
    const q2 = (db2.prepare("SELECT COUNT(*) AS n FROM qa_cards").get() as { n: number }).n
    db2.close()

    expect(c2).toBe(c1)
    expect(q2).toBe(q1)
  })
})
