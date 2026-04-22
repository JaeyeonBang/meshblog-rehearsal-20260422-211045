/**
 * Task 12 — Test 7: export-graph.ts
 * Fixture graph: verify level assignment + 6 JSON files written.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createDb, execute } from "../../src/lib/db/index.ts"
import { buildNoteGraph, buildConceptGraph, assignLevels, exportLevel, runExportGraph } from "../export-graph.ts"

const TMP_DIR = ".data/test-export-graph"
const TMP_DB = join(TMP_DIR, "export-graph.db")

function seedFixture(db: ReturnType<typeof createDb>) {
  // Create 5 notes with graph_status='done'
  for (let i = 1; i <= 5; i++) {
    execute(db, `
      INSERT OR IGNORE INTO notes (id, slug, title, content, content_hash, graph_status)
      VALUES (?, ?, ?, ?, ?, 'done')
    `, [`note-${i}`, `note-${i}`, `Note ${i}`, `Content ${i}`, `hash-${i}`])
  }

  // Create 5 entities
  for (let i = 1; i <= 5; i++) {
    db.prepare(`INSERT OR IGNORE INTO entities (id, name, entity_type) VALUES (?, ?, 'technology')`)
      .run(i, `entity-${i}`)
  }

  // Link entities to notes to create shared-entity edges
  // note-1 ↔ note-2 (via entity-1)
  // note-1 ↔ note-3 (via entity-2)
  // note-2 ↔ note-3 (via entity-3)
  // note-4 ↔ note-5 (via entity-4) — isolated sub-cluster
  const links = [
    ["note-1", 1], ["note-2", 1],   // shared entity-1
    ["note-1", 2], ["note-3", 2],   // shared entity-2
    ["note-2", 3], ["note-3", 3],   // shared entity-3
    ["note-4", 4], ["note-5", 4],   // shared entity-4
  ]
  for (const [noteId, entityId] of links) {
    execute(db, `INSERT OR IGNORE INTO note_entities (note_id, entity_id) VALUES (?, ?)`, [noteId, entityId])
  }

  // Create 3 concepts
  for (let i = 1; i <= 3; i++) {
    execute(db, `
      INSERT OR IGNORE INTO concepts (id, name, description, confidence)
      VALUES (?, ?, ?, 0.8)
    `, [`concept-${i}`, `Concept ${i}`, `Description ${i}`])
  }

  // Link concepts to entities
  execute(db, `INSERT OR IGNORE INTO concept_entities (concept_id, entity_id) VALUES ('concept-1', 1)`, [])
  execute(db, `INSERT OR IGNORE INTO concept_entities (concept_id, entity_id) VALUES ('concept-1', 2)`, [])
  execute(db, `INSERT OR IGNORE INTO concept_entities (concept_id, entity_id) VALUES ('concept-2', 3)`, [])
  execute(db, `INSERT OR IGNORE INTO concept_entities (concept_id, entity_id) VALUES ('concept-3', 4)`, [])
}

describe("export-graph", () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true })
    if (existsSync(TMP_DB)) unlinkSync(TMP_DB)
    db = createDb(TMP_DB)
    seedFixture(db)
  })

  it("produces 6 JSON files with valid nodes/links schema", async () => {
    const outDir = join(TMP_DIR, "graph-out-1")
    await runExportGraph(db, outDir)

    const fileNames = ["note-l1", "note-l2", "note-l3", "concept-l1", "concept-l2", "concept-l3"]
    for (const name of fileNames) {
      const filePath = join(outDir, `${name}.json`)
      expect(existsSync(filePath), `${name}.json should exist`).toBe(true)

      const j = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(Array.isArray(j.nodes), `${name}.json should have nodes array`).toBe(true)
      expect(Array.isArray(j.links), `${name}.json should have links array`).toBe(true)
    }
  })

  it("L3 is superset of L1 (inclusive node sets)", async () => {
    const outDir = join(TMP_DIR, "graph-out-2")
    await runExportGraph(db, outDir)

    const l1 = JSON.parse(readFileSync(join(outDir, "note-l1.json"), "utf-8"))
    const l3 = JSON.parse(readFileSync(join(outDir, "note-l3.json"), "utf-8"))

    const l1ids = new Set(l1.nodes.map((n: { id: string }) => n.id))
    const l3ids = new Set(l3.nodes.map((n: { id: string }) => n.id))

    for (const id of l1ids) {
      expect(l3ids.has(id), `L1 node ${id} must be present in L3`).toBe(true)
    }
  })

  it("L2 is superset of L1 (inclusive node sets)", async () => {
    const outDir = join(TMP_DIR, "graph-out-3")
    await runExportGraph(db, outDir)

    const l1 = JSON.parse(readFileSync(join(outDir, "note-l1.json"), "utf-8"))
    const l2 = JSON.parse(readFileSync(join(outDir, "note-l2.json"), "utf-8"))

    const l1ids = new Set(l1.nodes.map((n: { id: string }) => n.id))
    const l2ids = new Set(l2.nodes.map((n: { id: string }) => n.id))

    for (const id of l1ids) {
      expect(l2ids.has(id), `L1 node ${id} must be present in L2`).toBe(true)
    }
  })

  it("assigns levels 1/2/3 to all nodes", async () => {
    const outDir = join(TMP_DIR, "graph-out-4")
    await runExportGraph(db, outDir)

    const l3 = JSON.parse(readFileSync(join(outDir, "note-l3.json"), "utf-8"))
    for (const node of l3.nodes) {
      expect([1, 2, 3]).toContain(node.level)
    }
  })

  it("empty vault: produces 6 files each with empty nodes/links", async () => {
    // Fresh empty DB
    const emptyDb = createDb(join(TMP_DIR, "empty.db"))
    const outDir = join(TMP_DIR, "graph-out-empty")
    await runExportGraph(emptyDb, outDir)
    emptyDb.close()

    const fileNames = ["note-l1", "note-l2", "note-l3", "concept-l1", "concept-l2", "concept-l3"]
    for (const name of fileNames) {
      const filePath = join(outDir, `${name}.json`)
      expect(existsSync(filePath), `${name}.json should exist even for empty vault`).toBe(true)

      const j = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(j.nodes).toEqual([])
      expect(j.links).toEqual([])
    }
  })

  it("level_pin frontmatter overrides PageRank level", async () => {
    // Pin note-5 to level 1
    execute(db, "UPDATE notes SET level_pin = 1 WHERE id = 'note-5'", [])

    const outDir = join(TMP_DIR, "graph-out-pin")
    await runExportGraph(db, outDir)

    const l1 = JSON.parse(readFileSync(join(outDir, "note-l1.json"), "utf-8"))
    const pinned = l1.nodes.find((n: { id: string }) => n.id === "note-5")
    expect(pinned).toBeTruthy()
    expect(pinned.level).toBe(1)
    expect(pinned.pinned).toBe(true)
  })
})
