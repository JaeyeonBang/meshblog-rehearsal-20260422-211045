import { describe, it, expect, beforeEach } from "vitest"
import { unlinkSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runBuildIndex } from "../build-index.ts"
import { createDb } from "../../src/lib/db/index.ts"

const FIXTURE_DIRS = ["content/posts", "content/notes"]
const TMP_DIR = ".data"
const TMP_DB = join(TMP_DIR, "test-smoke.db")

const stubExtract = async (db: any, id: string, _content: string) => {
  const entitiesByNote: Record<string, { name: string; type: string }[]> = {
    "01-react-hooks": [
      { name: "React", type: "technology" },
      { name: "TypeScript", type: "technology" },
    ],
    "02-nextjs-rsc": [
      { name: "Next.js", type: "technology" },
      { name: "React", type: "technology" },
    ],
    "03-prisma-vs-drizzle": [
      { name: "Prisma", type: "technology" },
      { name: "Drizzle", type: "technology" },
      { name: "TypeScript", type: "technology" },
    ],
    "philosophy-on-writing": [{ name: "글쓰기", type: "concept" }],
  }
  const entities = entitiesByNote[id] ?? []
  const normalizeName = (s: string) => {
    const c = s.toLowerCase().trim()
    const aliases: Record<string, string> = { "next.js": "nextjs", "ts": "typescript" }
    return aliases[c] ?? c
  }
  for (const e of entities) {
    const name = normalizeName(e.name)
    const row = db.prepare("SELECT id, mention_count FROM entities WHERE name = ? AND entity_type = ?").get(name, e.type) as any
    let entityId: number
    if (row) {
      db.prepare("UPDATE entities SET mention_count = ?, last_seen_at = datetime('now') WHERE id = ?").run(row.mention_count + 1, row.id)
      entityId = row.id
    } else {
      const r = db.prepare("INSERT INTO entities (name, entity_type, description) VALUES (?, ?, ?)").run(name, e.type, "")
      entityId = Number(r.lastInsertRowid)
    }
    db.prepare("INSERT OR IGNORE INTO note_entities (note_id, entity_id) VALUES (?, ?)").run(id, entityId)
  }
  db.prepare("UPDATE notes SET graph_status = 'done' WHERE id = ?").run(id)
  return { entities, relationships: [] }
}

describe("build-index smoke (mocked LLM)", () => {
  beforeEach(() => {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
    if (existsSync(TMP_DB)) unlinkSync(TMP_DB)
  })

  it("processes fixtures, writes notes + entities, skips _drafts", async () => {
    const result = await runBuildIndex({
      dbPath: TMP_DB,
      baseDirs: FIXTURE_DIRS,
      extract: stubExtract,
      skipEmbed: true,
      skipConcepts: true,
    })
    expect(result.counts.notes).toBeGreaterThan(0)
    expect(result.counts.entities).toBeGreaterThan(0)
    expect(result.counts.note_entities).toBeGreaterThan(0)

    const db = createDb(TMP_DB)
    const notes = db.prepare("SELECT id, graph_status FROM notes").all() as { id: string; graph_status: string }[]
    expect(notes.every((n) => n.graph_status === "done")).toBe(true)
    const draftRow = db.prepare("SELECT id FROM notes WHERE id = ?").get("04-secret")
    expect(draftRow).toBeUndefined()
    db.close()
  })

  it("skips notes with draft: true frontmatter (D3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "build-index-draft-"))
    writeFileSync(
      join(dir, "clean.md"),
      "---\ntitle: Clean Note\n---\nbody",
    )
    writeFileSync(
      join(dir, "drafted.md"),
      "---\ntitle: Drafted Note\ndraft: true\n---\nbody",
    )
    try {
      await runBuildIndex({
        dbPath: TMP_DB,
        baseDirs: [dir],
        extract: stubExtract,
        skipEmbed: true,
        skipConcepts: true,
      })
      const db = createDb(TMP_DB)
      const clean = db.prepare("SELECT id FROM notes WHERE id = ?").get("clean")
      const drafted = db.prepare("SELECT id FROM notes WHERE id = ?").get("drafted")
      expect(clean).toBeDefined()
      expect(drafted).toBeUndefined()
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("deletes stale data when a published note flips to draft: true (D3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "build-index-flip-"))
    const file = join(dir, "flip.md")
    writeFileSync(file, "---\ntitle: Flip\n---\nv1 body")
    try {
      await runBuildIndex({
        dbPath: TMP_DB,
        baseDirs: [dir],
        extract: stubExtract,
        skipEmbed: true,
        skipConcepts: true,
      })
      const db1 = createDb(TMP_DB)
      expect(db1.prepare("SELECT id FROM notes WHERE id = ?").get("flip")).toBeDefined()
      db1.close()

      writeFileSync(file, "---\ntitle: Flip\ndraft: true\n---\nv1 body")
      await runBuildIndex({
        dbPath: TMP_DB,
        baseDirs: [dir],
        extract: stubExtract,
        skipEmbed: true,
        skipConcepts: true,
      })
      const db2 = createDb(TMP_DB)
      expect(db2.prepare("SELECT id FROM notes WHERE id = ?").get("flip")).toBeUndefined()
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("is idempotent: 2nd run skips unchanged notes (Patch D2 hash skip)", async () => {
    const r1 = await runBuildIndex({ dbPath: TMP_DB, baseDirs: FIXTURE_DIRS, extract: stubExtract, skipEmbed: true, skipConcepts: true })
    const db1 = createDb(TMP_DB)
    const ec1 = (db1.prepare("SELECT COUNT(*) as n FROM entities").get() as any).n
    const mc1 = (db1.prepare("SELECT SUM(mention_count) as n FROM entities").get() as any).n
    db1.close()

    const r2 = await runBuildIndex({ dbPath: TMP_DB, baseDirs: FIXTURE_DIRS, extract: stubExtract, skipEmbed: true, skipConcepts: true })
    const db2 = createDb(TMP_DB)
    const ec2 = (db2.prepare("SELECT COUNT(*) as n FROM entities").get() as any).n
    const mc2 = (db2.prepare("SELECT SUM(mention_count) as n FROM entities").get() as any).n
    db2.close()

    expect(ec2).toBe(ec1)
    expect(mc2).toBe(mc1)
    expect(r2.skipped).toBe(r1.processed)
  })
})
