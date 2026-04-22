/**
 * D4a mandatory regression tests — build-backlinks.ts
 *
 * Test 1: duplicate occurrence — same wikilink 3 times, 3 rows with distinct positions
 * Test 2: CASCADE on source draft flip — wikilinks deleted when source note is deleted
 * Test 3: SET NULL on target deletion — target_id becomes NULL, target_raw preserved
 *
 * Each test uses an in-process SQLite :memory: DB or a temp file.
 * Red-first criterion: remove the FK/logic being tested and the test must fail.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { createDb, execute, queryMany } from "../../src/lib/db/index.ts"
import { runBuildBacklinks } from "../build-backlinks.ts"

const TMP_DIR = ".data/test-build-backlinks"
mkdirSync(TMP_DIR, { recursive: true })

type WikilinkRow = {
  id: number
  source_id: string
  target_id: string | null
  target_raw: string
  alias: string | null
  position: number
}

/** Seed a minimal note into the DB */
function seedNote(
  db: ReturnType<typeof createDb>,
  id: string,
  content: string,
  title?: string,
): void {
  execute(
    db,
    `INSERT OR REPLACE INTO notes (id, slug, title, content, content_hash, graph_status)
     VALUES (?, ?, ?, ?, ?, 'done')`,
    [id, id, title ?? id, content, `hash-${id}`],
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 1: Duplicate occurrence — 3 [[foo]] in one note → 3 rows, distinct positions
// ──────────────────────────────────────────────────────────────────────────────
describe("build-backlinks: duplicate occurrence", () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(join(TMP_DIR, `dup-${Date.now()}.db`))
    // seed target note
    seedNote(db, "foo", "Foo note content.")
    // seed source note with [[foo]] three times at different positions
    seedNote(db, "note-a", "Start [[foo]] middle [[foo]] end [[foo]] done.")
  })

  it("records 3 rows for 3 occurrences of [[foo]], each with distinct position", () => {
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-dup") })

    const rows = queryMany<WikilinkRow>(
      db,
      "SELECT * FROM wikilinks WHERE source_id = 'note-a' AND target_id = 'foo' ORDER BY position",
      [],
    )

    expect(rows).toHaveLength(3)

    // Each row must have a distinct position
    const positions = rows.map(r => r.position)
    const uniquePositions = new Set(positions)
    expect(uniquePositions.size).toBe(3)

    // target_raw is 'foo' for all
    for (const row of rows) {
      expect(row.target_raw).toBe("foo")
    }
  })

  it("re-run is idempotent (DELETE + INSERT → still 3 rows)", () => {
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-dup-idempotent") })
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-dup-idempotent") })

    const rows = queryMany<WikilinkRow>(
      db,
      "SELECT * FROM wikilinks WHERE source_id = 'note-a' AND target_id = 'foo'",
      [],
    )
    expect(rows).toHaveLength(3)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 2: CASCADE on source deletion — wikilinks row removed when source is deleted
// (Simulates what happens when a note is flipped to draft: build-index deletes it)
// ──────────────────────────────────────────────────────────────────────────────
describe("build-backlinks: CASCADE on source deletion", () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(join(TMP_DIR, `cascade-${Date.now()}.db`))
    seedNote(db, "target-note", "Target content.")
    seedNote(db, "source-note", "Linking to [[target-note]] here.")
  })

  it("wikilinks row exists after build-backlinks", () => {
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-cascade") })

    const rows = queryMany<WikilinkRow>(
      db,
      "SELECT * FROM wikilinks WHERE source_id = 'source-note'",
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].target_id).toBe("target-note")
  })

  it("wikilinks row is CASCADE-deleted when source note is removed", () => {
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-cascade") })

    // Confirm row exists before deletion
    const before = queryMany<WikilinkRow>(
      db,
      "SELECT * FROM wikilinks WHERE source_id = 'source-note'",
      [],
    )
    expect(before).toHaveLength(1)

    // Delete the source note (simulates build-index removing a draft:true note)
    execute(db, "DELETE FROM notes WHERE id = 'source-note'", [])

    // FK CASCADE must remove the wikilinks row
    const after = queryMany<WikilinkRow>(
      db,
      "SELECT * FROM wikilinks WHERE source_id = 'source-note'",
      [],
    )
    expect(after).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 3: SET NULL on target deletion — target_id becomes NULL, target_raw preserved
// ──────────────────────────────────────────────────────────────────────────────
describe("build-backlinks: SET NULL on target deletion", () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(join(TMP_DIR, `setnull-${Date.now()}.db`))
    seedNote(db, "target", "Target note content.")
    seedNote(db, "source", "I link to [[target]] in this note.")
  })

  it("target_id is resolved after build-backlinks", () => {
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-setnull") })

    const rows = queryMany<WikilinkRow>(
      db,
      "SELECT target_id, target_raw FROM wikilinks WHERE source_id = 'source'",
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].target_id).toBe("target")
    expect(rows[0].target_raw).toBe("target")
  })

  it("target_id is SET NULL and target_raw preserved when target note is deleted", () => {
    runBuildBacklinks({ db, outputDir: join(TMP_DIR, "out-setnull") })

    // Confirm resolved link exists
    const before = queryMany<WikilinkRow>(
      db,
      "SELECT target_id, target_raw FROM wikilinks WHERE source_id = 'source'",
      [],
    )
    expect(before[0].target_id).toBe("target")

    // Delete the target note (simulates build-index removing a note whose file is deleted)
    execute(db, "DELETE FROM notes WHERE id = 'target'", [])

    // FK SET NULL must null out target_id but keep the row + target_raw
    const after = queryMany<WikilinkRow>(
      db,
      "SELECT target_id, target_raw FROM wikilinks WHERE source_id = 'source'",
      [],
    )
    expect(after).toHaveLength(1)
    expect(after[0].target_id).toBeNull()
    expect(after[0].target_raw).toBe("target")
  })
})
