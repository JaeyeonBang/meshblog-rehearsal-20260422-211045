import { queryOne, queryMany, execute, type Database } from "../db/index.ts"
import { createHash } from "crypto"

// --- Note Version Tracking ---

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16)
}

/**
 * Record a version snapshot for a note (idempotent by content_hash).
 * Enforces retention: keeps last 10 versions per note.
 * user_id removed.
 * $n → ? (porting-rules rule 1).
 * NOW() → datetime('now') (porting-rules rule 3).
 */
export function createNoteVersion(
  db: Database.Database,
  noteId: string,
  content: string,
  diffSummary?: string
): { created: boolean; versionId: string | null } {
  const contentHash = computeContentHash(content)

  const existing = queryOne<{ id: string }>(
    db,
    `SELECT id FROM note_versions
     WHERE note_id = ? AND content_hash = ?`,
    [noteId, contentHash]
  )

  if (existing) {
    return { created: false, versionId: existing.id }
  }

  // Enforce retention: keep last 10 versions per note
  const versionCount = queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM note_versions WHERE note_id = ?`,
    [noteId]
  )

  if (versionCount && versionCount.count >= 10) {
    execute(
      db,
      `DELETE FROM note_versions
       WHERE id = (
         SELECT id FROM note_versions
         WHERE note_id = ?
         ORDER BY created_at ASC
         LIMIT 1
       )`,
      [noteId]
    )
  }

  const newId = crypto.randomUUID()
  execute(
    db,
    `INSERT INTO note_versions (id, note_id, content_hash, diff_summary)
     VALUES (?, ?, ?, ?)`,
    [newId, noteId, contentHash, diffSummary ?? null]
  )

  return { created: true, versionId: newId }
}

// --- Temporal Context for RAG ---

export type TemporalResult = {
  id: string
  title: string
  content: string
  score: number
  tags: string[]
  source: "temporal"
}

/**
 * Get notes that have multiple versions for the given entity names.
 * "Evolved" notes = notes with 2+ versions for entities of interest.
 * user_id removed.
 * ANY($n::text[]) → IN (?,?,...) (porting-rules rule 7).
 */
export async function getTemporalContext(
  db: Database.Database,
  entityNames: string[],
  limit = 3
): Promise<TemporalResult[]> {
  if (entityNames.length === 0) return []

  const normalizedNames = entityNames.map((n) => n.toLowerCase().trim()).filter(Boolean)
  if (normalizedNames.length === 0) return []

  const namePlaceholders = normalizedNames.map(() => "?").join(",")

  const evolvedNotes = queryMany<{ note_id: string; version_count: number }>(
    db,
    `SELECT nv.note_id, COUNT(*) as version_count
     FROM note_versions nv
     JOIN note_entities ne ON nv.note_id = ne.note_id
     JOIN entities e ON ne.entity_id = e.id
     WHERE e.name IN (${namePlaceholders})
     GROUP BY nv.note_id
     HAVING COUNT(*) >= 2
     ORDER BY MAX(nv.created_at) DESC
     LIMIT ?`,
    [...normalizedNames, limit]
  )

  if (evolvedNotes.length === 0) return []

  const noteIds = evolvedNotes.map((n) => n.note_id)
  const notePlaceholders = noteIds.map(() => "?").join(",")

  const notes = queryMany<{ id: string; title: string; content: string; tags: string }>(
    db,
    `SELECT id, title, content, tags FROM notes WHERE id IN (${notePlaceholders})`,
    noteIds
  )

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    // tags stored as JSON string (porting-rules rule 4)
    tags: (() => {
      try { return JSON.parse(note.tags) as string[] } catch { return [] }
    })(),
    score: 0.6,
    source: "temporal" as const,
  }))
}

// --- Note Evolution Query ---

export type NoteVersionInfo = {
  id: string
  content_hash: string
  diff_summary: string | null
  created_at: string
}

export function getNoteHistory(
  db: Database.Database,
  noteId: string
): NoteVersionInfo[] {
  return queryMany<NoteVersionInfo>(
    db,
    `SELECT id, content_hash, diff_summary, created_at
     FROM note_versions
     WHERE note_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [noteId]
  )
}

// --- Entity Evolution ---

export function getEntityEvolution(
  db: Database.Database,
  entityName: string
): {
  entity: { name: string; first_seen_at: string; last_seen_at: string; mention_count: number } | null
  timeline: { note_title: string; created_at: string }[]
} {
  const entity = queryOne<{
    name: string
    first_seen_at: string
    last_seen_at: string
    mention_count: number
  }>(
    db,
    `SELECT name, first_seen_at, last_seen_at, mention_count
     FROM entities
     WHERE name = ?`,
    [entityName.toLowerCase().trim()]
  )

  if (!entity) return { entity: null, timeline: [] }

  const timeline = queryMany<{ note_title: string; created_at: string }>(
    db,
    `SELECT n.title as note_title, n.created_at
     FROM notes n
     JOIN note_entities ne ON n.id = ne.note_id
     JOIN entities e ON ne.entity_id = e.id
     WHERE e.name = ?
     ORDER BY n.created_at ASC`,
    [entityName.toLowerCase().trim()]
  )

  return { entity, timeline }
}
