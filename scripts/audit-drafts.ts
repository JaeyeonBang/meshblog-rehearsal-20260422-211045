import { readFileSync, existsSync } from "node:fs"
import { basename, extname } from "node:path"
import matter from "gray-matter"
import { createDb, queryMany } from "../src/lib/db/index.ts"
import { discoverMarkdown } from "../src/lib/content/discover.ts"

const DEFAULT_DB = process.env.MESHBLOG_DB ?? ".data/index.db"
const DEFAULT_DIRS = ["content/posts", "content/notes"]

export type Leak = { id: string; path: string; reason: "draft:true" | "public:false" }

export type AuditResult = {
  leaks: Leak[]
  orphans: string[]
}

export type AuditOptions = {
  dbPath?: string
  baseDirs?: string[]
}

function discoverAll(baseDirs: string[]): { path: string; id: string; fm: Record<string, unknown> }[] {
  return discoverMarkdown(baseDirs, { skipUnderscore: false }).map((f) => {
    const raw = readFileSync(f.path, "utf-8")
    const { data } = matter(raw)
    return { path: f.path, id: basename(f.path, extname(f.path)), fm: data }
  })
}

export function auditDrafts(options: AuditOptions = {}): AuditResult {
  const dbPath = options.dbPath ?? DEFAULT_DB
  const baseDirs = options.baseDirs ?? DEFAULT_DIRS

  const files = discoverAll(baseDirs)
  const fileIds = new Set(files.map((f) => f.id))

  if (!existsSync(dbPath)) {
    return { leaks: [], orphans: [] }
  }
  const db = createDb(dbPath)
  let dbIds: string[] = []
  try {
    dbIds = queryMany<{ id: string }>(db, "SELECT id FROM notes", []).map((r) => r.id)
  } finally {
    db.close()
  }
  const dbSet = new Set(dbIds)

  const leaks: Leak[] = []
  for (const f of files) {
    const reason: Leak["reason"] | null =
      f.fm.draft === true ? "draft:true" : f.fm.public === false ? "public:false" : null
    if (reason && dbSet.has(f.id)) {
      leaks.push({ id: f.id, path: f.path, reason })
    }
  }

  const orphans = dbIds.filter((id) => !fileIds.has(id))

  return { leaks, orphans }
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("audit-drafts.ts")

if (isMainModule) {
  const result = auditDrafts()
  if (result.leaks.length === 0 && result.orphans.length === 0) {
    console.log("[audit] clean. no draft leaks or orphaned DB rows.")
    process.exit(0)
  }
  if (result.leaks.length > 0) {
    console.error(`[audit] ${result.leaks.length} draft leak(s):`)
    for (const l of result.leaks) {
      console.error(`  ✗ ${l.id}  (${l.reason})  ${l.path}`)
    }
  }
  if (result.orphans.length > 0) {
    console.error(`[audit] ${result.orphans.length} orphan DB row(s) (file deleted but DB row remains):`)
    for (const id of result.orphans) {
      console.error(`  ✗ ${id}`)
    }
  }
  process.exit(1)
}
