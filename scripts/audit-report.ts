#!/usr/bin/env tsx
/**
 * scripts/audit-report.ts
 * D6 — Generate a markdown audit report covering:
 *   1. Draft leaks (draft:true / public:false notes still indexed)
 *   2. Orphan DB rows (DB entry without a matching file)
 *   3. Broken wikilinks (wikilinks.target_id IS NULL)
 *
 * Usage:
 *   bun run scripts/audit-report.ts
 *   tsx scripts/audit-report.ts --out /path/to/report.md
 *   tsx scripts/audit-report.ts --db .data/index.db --out audit-report.md
 *
 * v1 contract: read-only. No source files are mutated.
 */

import { writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { auditDrafts } from "./audit-drafts.ts"
import { createDb, queryMany } from "../src/lib/db/index.ts"

// ── types ────────────────────────────────────────────────────────────────────

export type BrokenWikilink = {
  sourceSlug: string
  targetRaw: string
  position: number
}

export type AuditReportOptions = {
  dbPath?: string
  baseDirs?: string[]
  outPath?: string
}

export type AuditReportResult = {
  draftLeaks: number
  orphans: number
  brokenWikilinks: number
  notesScanned: number
  wikilinksScanned: number
  reportPath: string
  reportText: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString()
}

function yyyyMmDd(): string {
  return new Date().toISOString().slice(0, 10)
}

function queryBrokenWikilinks(dbPath: string): BrokenWikilink[] {
  if (!existsSync(dbPath)) return []
  const db = createDb(dbPath)
  try {
    // Check wikilinks table exists (D4 schema may not be populated yet)
    const tableExists =
      (db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='wikilinks'",
      ).get() as { name: string } | undefined) !== undefined
    if (!tableExists) return []

    return queryMany<{ source_slug: string; target_raw: string; position: number }>(
      db,
      `SELECT n.slug AS source_slug, w.target_raw, w.position
       FROM wikilinks w
       JOIN notes n ON n.id = w.source_id
       WHERE w.target_id IS NULL
       ORDER BY n.slug, w.position`,
      [],
    ).map((r) => ({
      sourceSlug: r.source_slug,
      targetRaw: r.target_raw,
      position: r.position,
    }))
  } finally {
    db.close()
  }
}

function queryNotesCount(dbPath: string): number {
  if (!existsSync(dbPath)) return 0
  const db = createDb(dbPath)
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }
    return row.n
  } finally {
    db.close()
  }
}

function queryWikilinksCount(dbPath: string): number {
  if (!existsSync(dbPath)) return 0
  const db = createDb(dbPath)
  try {
    const tableExists =
      (db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='wikilinks'",
      ).get() as { name: string } | undefined) !== undefined
    if (!tableExists) return 0
    const row = db.prepare("SELECT COUNT(*) AS n FROM wikilinks").get() as { n: number }
    return row.n
  } finally {
    db.close()
  }
}

// ── report builder ───────────────────────────────────────────────────────────

export function buildReportText(opts: {
  date: string
  dbPath: string
  notesScanned: number
  wikilinksScanned: number
  generatedAt: string
  leaks: { id: string; path: string; reason: "draft:true" | "public:false" }[]
  orphans: string[]
  brokenWikilinks: BrokenWikilink[]
}): string {
  const { date, dbPath, notesScanned, wikilinksScanned, generatedAt, leaks, orphans, brokenWikilinks } =
    opts

  const lines: string[] = []

  lines.push(`# meshblog daily audit — ${date}`)
  lines.push("")
  lines.push("## Summary")
  lines.push("")
  lines.push("| Category | Count |")
  lines.push("| :--- | ---: |")
  lines.push(`| Draft leaks | ${leaks.length} |`)
  lines.push(`| Orphan DB rows | ${orphans.length} |`)
  lines.push(`| Broken wikilinks | ${brokenWikilinks.length} |`)
  lines.push("")

  lines.push("## Draft leaks")
  lines.push("")
  if (leaks.length === 0) {
    lines.push("_None._")
  } else {
    for (const l of leaks) {
      lines.push(`- \`${l.id}\` (reason: ${l.reason}) — ${l.path}`)
    }
  }
  lines.push("")

  lines.push("## Orphans")
  lines.push("")
  if (orphans.length === 0) {
    lines.push("_None._")
  } else {
    for (const id of orphans) {
      lines.push(`- \`${id}\``)
    }
  }
  lines.push("")

  lines.push("## Broken wikilinks")
  lines.push("")
  if (brokenWikilinks.length === 0) {
    lines.push("_None._")
  } else {
    for (const w of brokenWikilinks) {
      lines.push(`- \`${w.sourceSlug}\` → \`[[${w.targetRaw}]]\` (position ${w.position})`)
    }
  }
  lines.push("")

  lines.push("## Run metadata")
  lines.push("")
  lines.push(`- DB path: ${dbPath}`)
  lines.push(`- Notes scanned: ${notesScanned}`)
  lines.push(`- Wikilinks scanned: ${wikilinksScanned}`)
  lines.push(`- Generated: ${generatedAt}`)
  lines.push("")

  return lines.join("\n")
}

// ── main export ───────────────────────────────────────────────────────────────

export async function runAuditReport(opts: AuditReportOptions = {}): Promise<AuditReportResult> {
  const dbPath = opts.dbPath ?? (process.env.MESHBLOG_DB ?? ".data/index.db")
  const baseDirs = opts.baseDirs ?? ["content/posts", "content/notes"]
  const outPath = opts.outPath ?? "audit-report.md"

  const draftResult = auditDrafts({ dbPath, baseDirs })
  const brokenWikilinks = queryBrokenWikilinks(dbPath)
  const notesScanned = queryNotesCount(dbPath)
  const wikilinksScanned = queryWikilinksCount(dbPath)

  const reportText = buildReportText({
    date: yyyyMmDd(),
    dbPath,
    notesScanned,
    wikilinksScanned,
    generatedAt: isoNow(),
    leaks: draftResult.leaks,
    orphans: draftResult.orphans,
    brokenWikilinks,
  })

  writeFileSync(outPath, reportText, "utf-8")

  return {
    draftLeaks: draftResult.leaks.length,
    orphans: draftResult.orphans.length,
    brokenWikilinks: brokenWikilinks.length,
    notesScanned,
    wikilinksScanned,
    reportPath: outPath,
    reportText,
  }
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("audit-report.ts")

if (isMainModule) {
  const args = process.argv.slice(2)
  let outPath = "audit-report.md"
  let dbPath: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outPath = args[i + 1]
      i++
    } else if (args[i] === "--db" && args[i + 1]) {
      dbPath = args[i + 1]
      i++
    }
  }

  runAuditReport({ outPath, dbPath })
    .then((result) => {
      console.log(`[audit-report] report written → ${result.reportPath}`)
      console.log(
        `[audit-report] draft leaks: ${result.draftLeaks}, orphans: ${result.orphans}, broken wikilinks: ${result.brokenWikilinks}`,
      )
    })
    .catch((err) => {
      console.error("[audit-report] fatal:", err)
      process.exit(1)
    })
}
