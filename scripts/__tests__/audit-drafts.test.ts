import { describe, it, expect, beforeEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, existsSync, unlinkSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { auditDrafts } from "../audit-drafts.ts"
import { createDb, execute } from "../../src/lib/db/index.ts"

const TMP_DIR = ".data"
const TMP_DB = join(TMP_DIR, "test-audit.db")

function seedNote(dbPath: string, id: string) {
  const db = createDb(dbPath)
  execute(
    db,
    `INSERT INTO notes (id, slug, title, content, content_hash, folder_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, id, `title ${id}`, "body", "hash", "content/notes"],
  )
  db.close()
}

describe("audit-drafts", () => {
  beforeEach(() => {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
    if (existsSync(TMP_DB)) unlinkSync(TMP_DB)
  })

  it("clean vault returns zero leaks", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "audit-clean-"))
    writeFileSync(join(contentDir, "ok.md"), "---\ntitle: Ok\n---\nbody")
    seedNote(TMP_DB, "ok")
    try {
      const result = auditDrafts({ dbPath: TMP_DB, baseDirs: [contentDir] })
      expect(result.leaks).toEqual([])
      expect(result.orphans).toEqual([])
    } finally {
      rmSync(contentDir, { recursive: true, force: true })
    }
  })

  it("flags draft:true file that still has a DB row (leak)", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "audit-leak-"))
    writeFileSync(
      join(contentDir, "leaked.md"),
      "---\ntitle: Leaked\ndraft: true\n---\nbody",
    )
    seedNote(TMP_DB, "leaked")
    try {
      const result = auditDrafts({ dbPath: TMP_DB, baseDirs: [contentDir] })
      expect(result.leaks.map((l) => l.id)).toContain("leaked")
      expect(result.leaks[0].reason).toBe("draft:true")
    } finally {
      rmSync(contentDir, { recursive: true, force: true })
    }
  })

  it("flags public:false file that still has a DB row (leak)", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "audit-leak-pub-"))
    writeFileSync(
      join(contentDir, "private.md"),
      "---\ntitle: Private\npublic: false\n---\nbody",
    )
    seedNote(TMP_DB, "private")
    try {
      const result = auditDrafts({ dbPath: TMP_DB, baseDirs: [contentDir] })
      expect(result.leaks.map((l) => l.id)).toContain("private")
      expect(result.leaks[0].reason).toBe("public:false")
    } finally {
      rmSync(contentDir, { recursive: true, force: true })
    }
  })

  it("flags DB rows without a matching file (orphan)", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "audit-orphan-"))
    writeFileSync(join(contentDir, "present.md"), "---\ntitle: Present\n---\nbody")
    seedNote(TMP_DB, "present")
    seedNote(TMP_DB, "vanished")
    try {
      const result = auditDrafts({ dbPath: TMP_DB, baseDirs: [contentDir] })
      expect(result.orphans).toContain("vanished")
      expect(result.orphans).not.toContain("present")
    } finally {
      rmSync(contentDir, { recursive: true, force: true })
    }
  })

  it("ignores draft file with no DB row (correctly excluded, no leak)", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "audit-ok-draft-"))
    writeFileSync(
      join(contentDir, "quiet-draft.md"),
      "---\ntitle: Quiet\ndraft: true\n---\nbody",
    )
    try {
      const result = auditDrafts({ dbPath: TMP_DB, baseDirs: [contentDir] })
      expect(result.leaks).toEqual([])
    } finally {
      rmSync(contentDir, { recursive: true, force: true })
    }
  })
})
