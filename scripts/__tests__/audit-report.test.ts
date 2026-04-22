import { describe, it, expect, beforeEach } from "vitest"
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  unlinkSync,
  mkdirSync,
  readFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runAuditReport, buildReportText } from "../audit-report.ts"
import { createDb, execute } from "../../src/lib/db/index.ts"

// ── helpers ───────────────────────────────────────────────────────────────────

const TMP_DIR = ".data"
const TMP_DB = join(TMP_DIR, "test-audit-report.db")

function seedNote(dbPath: string, id: string): void {
  const db = createDb(dbPath)
  execute(
    db,
    `INSERT INTO notes (id, slug, title, content, content_hash, folder_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, id, `title ${id}`, "body", `hash-${id}`, "content/notes"],
  )
  db.close()
}

function seedWikilink(
  dbPath: string,
  sourceId: string,
  targetRaw: string,
  targetId: string | null,
  position: number,
): void {
  const db = createDb(dbPath)
  execute(
    db,
    `INSERT INTO wikilinks (source_id, target_raw, target_id, position)
     VALUES (?, ?, ?, ?)`,
    [sourceId, targetRaw, targetId, position],
  )
  db.close()
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("audit-report / buildReportText", () => {
  it("produces stable section headings when all counts are zero", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/test.db",
      notesScanned: 0,
      wikilinksScanned: 0,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [],
      orphans: [],
      brokenWikilinks: [],
    })
    expect(text).toContain("# meshblog daily audit — 2026-04-21")
    expect(text).toContain("## Summary")
    expect(text).toContain("## Draft leaks")
    expect(text).toContain("## Orphans")
    expect(text).toContain("## Broken wikilinks")
    expect(text).toContain("## Run metadata")
  })

  it("summary table shows 0 | 0 | 0 when clean", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/test.db",
      notesScanned: 5,
      wikilinksScanned: 10,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [],
      orphans: [],
      brokenWikilinks: [],
    })
    expect(text).toContain("| Draft leaks | 0 |")
    expect(text).toContain("| Orphan DB rows | 0 |")
    expect(text).toContain("| Broken wikilinks | 0 |")
  })

  it("summary table shows 1 | 1 | 1 with one of each category", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/test.db",
      notesScanned: 3,
      wikilinksScanned: 2,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [{ id: "leak-note", path: "content/notes/leak-note.md", reason: "draft:true" }],
      orphans: ["orphan-id"],
      brokenWikilinks: [{ sourceSlug: "source-note", targetRaw: "missing-note", position: 42 }],
    })
    expect(text).toContain("| Draft leaks | 1 |")
    expect(text).toContain("| Orphan DB rows | 1 |")
    expect(text).toContain("| Broken wikilinks | 1 |")
  })

  it("draft leaks section lists each leak", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/test.db",
      notesScanned: 1,
      wikilinksScanned: 0,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [{ id: "my-draft", path: "content/notes/my-draft.md", reason: "draft:true" }],
      orphans: [],
      brokenWikilinks: [],
    })
    expect(text).toContain("`my-draft`")
    expect(text).toContain("draft:true")
    expect(text).toContain("content/notes/my-draft.md")
  })

  it("orphans section lists each orphan id", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/test.db",
      notesScanned: 2,
      wikilinksScanned: 0,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [],
      orphans: ["vanished-note"],
      brokenWikilinks: [],
    })
    expect(text).toContain("`vanished-note`")
  })

  it("broken wikilinks section lists source, target_raw, and position", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/test.db",
      notesScanned: 2,
      wikilinksScanned: 3,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [],
      orphans: [],
      brokenWikilinks: [{ sourceSlug: "my-note", targetRaw: "nonexistent", position: 99 }],
    })
    expect(text).toContain("`my-note`")
    expect(text).toContain("`[[nonexistent]]`")
    expect(text).toContain("position 99")
  })

  it("run metadata section includes db path and counts", () => {
    const text = buildReportText({
      date: "2026-04-21",
      dbPath: ".data/special.db",
      notesScanned: 7,
      wikilinksScanned: 14,
      generatedAt: "2026-04-21T09:00:00.000Z",
      leaks: [],
      orphans: [],
      brokenWikilinks: [],
    })
    expect(text).toContain(".data/special.db")
    expect(text).toContain("Notes scanned: 7")
    expect(text).toContain("Wikilinks scanned: 14")
  })
})

describe("audit-report / runAuditReport (integration)", () => {
  let contentDir: string
  let outFile: string

  beforeEach(() => {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
    if (existsSync(TMP_DB)) unlinkSync(TMP_DB)
    contentDir = mkdtempSync(join(tmpdir(), "audit-rpt-"))
    outFile = join(tmpdir(), `audit-rpt-out-${Date.now()}.md`)
  })

  const cleanup = () => {
    try { rmSync(contentDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { if (existsSync(outFile)) unlinkSync(outFile) } catch { /* ignore */ }
  }

  it("writes report file and returns correct counts for 1/1/1 scenario", async () => {
    // Draft leak: a file with draft:true that has a DB row
    writeFileSync(
      join(contentDir, "leaked.md"),
      "---\ntitle: Leaked\ndraft: true\n---\nbody",
    )
    seedNote(TMP_DB, "leaked")

    // Orphan: a DB row with no matching file
    seedNote(TMP_DB, "orphaned-note")

    // Broken wikilink: a wikilink row with target_id = NULL
    seedWikilink(TMP_DB, "leaked", "missing-target", null, 5)

    try {
      const result = await runAuditReport({
        dbPath: TMP_DB,
        baseDirs: [contentDir],
        outPath: outFile,
      })

      // Verify return values
      expect(result.draftLeaks).toBe(1)
      expect(result.orphans).toBe(1)
      expect(result.brokenWikilinks).toBe(1)
      expect(result.reportPath).toBe(outFile)

      // Verify file was written
      expect(existsSync(outFile)).toBe(true)
      const written = readFileSync(outFile, "utf-8")

      // Summary table counts
      expect(written).toContain("| Draft leaks | 1 |")
      expect(written).toContain("| Orphan DB rows | 1 |")
      expect(written).toContain("| Broken wikilinks | 1 |")

      // Draft leaks section
      expect(written).toContain("`leaked`")
      expect(written).toContain("draft:true")

      // Orphans section
      expect(written).toContain("`orphaned-note`")

      // Broken wikilinks section
      expect(written).toContain("`[[missing-target]]`")
    } finally {
      cleanup()
    }
  })

  it("writes report even when DB does not exist (no crash)", async () => {
    // Use a path that doesn't exist — should return zeros
    const missingDb = join(TMP_DIR, "nonexistent-audit.db")
    if (existsSync(missingDb)) unlinkSync(missingDb)

    try {
      const result = await runAuditReport({
        dbPath: missingDb,
        baseDirs: [contentDir],
        outPath: outFile,
      })

      expect(result.draftLeaks).toBe(0)
      expect(result.orphans).toBe(0)
      expect(result.brokenWikilinks).toBe(0)
      expect(existsSync(outFile)).toBe(true)

      const written = readFileSync(outFile, "utf-8")
      expect(written).toContain("## Summary")
    } finally {
      cleanup()
    }
  })

  it("report has all required headings for diff stability", async () => {
    try {
      const result = await runAuditReport({
        dbPath: TMP_DB,
        baseDirs: [contentDir],
        outPath: outFile,
      })

      const text = result.reportText
      const headings = [
        "# meshblog daily audit",
        "## Summary",
        "## Draft leaks",
        "## Orphans",
        "## Broken wikilinks",
        "## Run metadata",
      ]
      for (const h of headings) {
        expect(text, `Missing heading: ${h}`).toContain(h)
      }
    } finally {
      cleanup()
    }
  })

  it("resolves wikilinks with target_id (not NULL) as non-broken", async () => {
    writeFileSync(join(contentDir, "source.md"), "---\ntitle: Source\n---\nbody")
    writeFileSync(join(contentDir, "target.md"), "---\ntitle: Target\n---\nbody")
    seedNote(TMP_DB, "source")
    seedNote(TMP_DB, "target")

    // Resolved wikilink (target_id is set — not broken)
    seedWikilink(TMP_DB, "source", "target", "target", 10)
    // Unresolved wikilink (target_id is NULL — broken)
    seedWikilink(TMP_DB, "source", "ghost", null, 20)

    try {
      const result = await runAuditReport({
        dbPath: TMP_DB,
        baseDirs: [contentDir],
        outPath: outFile,
      })

      expect(result.brokenWikilinks).toBe(1)
      expect(result.reportText).toContain("`[[ghost]]`")
      expect(result.reportText).not.toContain("`[[target]]`")
    } finally {
      cleanup()
    }
  })
})
