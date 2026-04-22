/**
 * build-backlinks.ts — D4a: parse [[wikilinks]] from note content,
 * write rows to the `wikilinks` table, and emit public/graph/backlinks.json.
 *
 * Exports `runBuildBacklinks()` for use by build-index.ts and tests.
 */
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createDb, queryMany, type Database } from "../src/lib/db/index.ts"

// Reuse the canonical regex from strip-wikilinks.ts (D2).
// We need a fresh RegExp per call (lastIndex is stateful on /g regexes).
function makeWikilinkRe(): RegExp {
  return /\[\[([^\]|]*)(\|([^\]]*))?\]\]/g
}

const DB_PATH = process.env.MESHBLOG_DB ?? ".data/index.db"
const GRAPH_DIR = "public/graph"

// ── Types ──────────────────────────────────────────────────────────────────────

export type NoteStub = { id: string; title: string; content: string }

export type BacklinksJson = {
  nodes: Array<{ id: string; title: string }>
  edges: Array<{ source: string; target: string; alias?: string }>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a map from lowercased slug → note id for target resolution.
 * Both `id` and `slug` are the same in this schema, so we key by id.toLowerCase().
 */
function buildSlugMap(notes: NoteStub[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const note of notes) {
    map.set(note.id.toLowerCase(), note.id)
  }
  return map
}

// ── Core runner ────────────────────────────────────────────────────────────────

export type BuildBacklinksOptions = {
  db: Database.Database
  notes?: NoteStub[]         // If omitted, all notes are read from DB
  dryRun?: boolean           // If true, skip DB writes + file writes
  outputDir?: string         // Output dir for backlinks.json (default: public/graph)
}

export function runBuildBacklinks(opts: BuildBacklinksOptions): BacklinksJson {
  const { db, dryRun = false } = opts
  const outputDir = opts.outputDir ?? GRAPH_DIR

  // 1. Load all notes if not provided
  const allNotes: NoteStub[] =
    opts.notes ??
    queryMany<NoteStub>(db, "SELECT id, title, content FROM notes", [])

  const slugMap = buildSlugMap(allNotes)

  // 2. Parse wikilinks from all note content
  type WikilinkRow = {
    source_id: string
    target_id: string | null
    target_raw: string
    alias: string | null
    position: number
  }

  const rows: WikilinkRow[] = []
  const sourceIds = new Set<string>()

  for (const note of allNotes) {
    sourceIds.add(note.id)
    const re = makeWikilinkRe()
    let match: RegExpExecArray | null

    while ((match = re.exec(note.content)) !== null) {
      // Skip image-embed form: ![[...]]
      // Check the char before the opening [[ in the original content
      const offset = match.index
      if (offset > 0 && note.content[offset - 1] === "!") continue

      const rawTarget = match[1] ?? ""
      const alias = match[3] ?? null

      const targetRaw = rawTarget.trim().toLowerCase()
      if (!targetRaw) continue

      const resolvedId = slugMap.get(targetRaw) ?? null

      rows.push({
        source_id: note.id,
        target_id: resolvedId,
        target_raw: targetRaw,
        alias: alias ? alias.trim() : null,
        position: offset,
      })
    }
  }

  // 3. Write to DB in a single transaction
  if (!dryRun && sourceIds.size > 0) {
    const sourceIdList = [...sourceIds]
    const placeholders = sourceIdList.map(() => "?").join(",")

    db.transaction(() => {
      // Delete existing wikilinks for these sources first
      db.prepare(
        `DELETE FROM wikilinks WHERE source_id IN (${placeholders})`,
      ).run(...sourceIdList)

      // Insert new rows
      const insert = db.prepare(
        `INSERT INTO wikilinks (source_id, target_id, target_raw, alias, position)
         VALUES (?, ?, ?, ?, ?)`,
      )
      for (const row of rows) {
        insert.run(row.source_id, row.target_id, row.target_raw, row.alias, row.position)
      }
    })()

    console.log(
      `[build-backlinks] wrote ${rows.length} wikilink rows for ${sourceIds.size} notes`,
    )
  } else if (dryRun) {
    console.log(
      `[build-backlinks] dry-run: found ${rows.length} wikilinks across ${sourceIds.size} notes (no writes)`,
    )
  }

  // 4. Build backlinks.json — only resolved edges (target_id IS NOT NULL)
  const nodeSet = new Set<string>()
  const edges: BacklinksJson["edges"] = []

  for (const row of rows) {
    if (row.target_id === null) continue
    nodeSet.add(row.source_id)
    nodeSet.add(row.target_id)
    const edge: BacklinksJson["edges"][number] = {
      source: row.source_id,
      target: row.target_id,
    }
    if (row.alias) edge.alias = row.alias
    edges.push(edge)
  }

  // Build title map from allNotes
  const titleMap = new Map(allNotes.map((n) => [n.id, n.title]))

  const nodes: BacklinksJson["nodes"] = [...nodeSet].map((id) => ({
    id,
    title: titleMap.get(id) ?? id,
  }))

  const json: BacklinksJson = { nodes, edges }

  if (!dryRun) {
    mkdirSync(outputDir, { recursive: true })
    const outPath = join(outputDir, "backlinks.json")
    writeFileSync(outPath, JSON.stringify(json, null, 2))
    console.log(
      `[build-backlinks] ${outPath}: ${nodes.length} nodes, ${edges.length} edges`,
    )
  }

  return json
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("build-backlinks.ts")

if (isMainModule) {
  const db = createDb(DB_PATH)
  try {
    runBuildBacklinks({ db })
    console.log("[build-backlinks] done")
  } finally {
    db.close()
  }
}
