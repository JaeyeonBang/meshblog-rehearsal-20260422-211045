import { queryMany, type Database } from "../db/index.ts"

export type EpisodicBoost = {
  noteId: string
  boost: number
}

/**
 * Get recently-accessed note IDs and assign a small boost score.
 * In Volla this reads from `conversations` table — meshblog pre-gen model
 * has no runtime conversations, so this is a stub that returns empty.
 * Phase 4 (/ask endpoint) will populate a conversations table and wire this up.
 *
 * user_id removed.
 * ANY($1) → IN (?,?,...) (porting-rules rule 7).
 */
export async function getEpisodicContext(
  db: Database.Database,
  limit = 5
): Promise<EpisodicBoost[]> {
  try {
    // conversations table does not exist in Phase 2 schema.
    // Gracefully return empty rather than throwing.
    // TODO(Phase 4): add conversations table and wire up episodic boost.
    const hasTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'`
      )
      .get() as { name: string } | undefined

    if (!hasTable) return []

    const conversations = queryMany<{ context_used: string }>(
      db,
      `SELECT context_used FROM conversations ORDER BY created_at DESC LIMIT ?`,
      [limit]
    )

    if (conversations.length === 0) return []

    const noteIds = new Set<string>()

    for (const conv of conversations) {
      let contextUsed: unknown
      try {
        contextUsed = JSON.parse(conv.context_used)
      } catch {
        continue
      }
      if (!Array.isArray(contextUsed)) continue

      for (const ctx of contextUsed) {
        if (
          typeof ctx === "object" &&
          ctx !== null &&
          typeof (ctx as Record<string, unknown>).noteId === "string"
        ) {
          noteIds.add((ctx as Record<string, unknown>).noteId as string)
        }
      }
    }

    if (noteIds.size === 0) return []

    const idList = [...noteIds]
    const placeholders = idList.map(() => "?").join(",")

    const existing = queryMany<{ id: string }>(
      db,
      `SELECT id FROM notes WHERE id IN (${placeholders})`,
      idList
    )

    const existingIds = new Set(existing.map((n) => n.id))

    return [...existingIds].map((noteId) => ({
      noteId,
      boost: 0.1,
    }))
  } catch (err) {
    console.error("[episodic] Failed to get episodic context:", err instanceof Error ? err.message : err)
    return []
  }
}
