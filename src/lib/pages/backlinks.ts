// backlinks.ts — inbound wikilink references for a given note
//
// Schema: wikilinks(id, source_id, target_id, alias, position)
// Strategy: for a given note (target), find all notes that link to it,
// returning the source note's slug, title, and the first alias used (if any).
// Self-references are excluded via the `n.id != ?` predicate.
// Results ordered by source note's updated_at descending (most-recently updated
// linking notes first) then LIMIT applied.

import { openReadonlyDb } from './db'

export type Backlink = {
  source_id: string
  source_slug: string
  source_title: string
  alias?: string  // first alias used, if any
}

export function getBacklinksForNote(noteId: string, limit = 10): Backlink[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT w.source_id, n.slug AS source_slug, n.title AS source_title, w.alias
         FROM wikilinks w
         JOIN notes n ON n.id = w.source_id
         WHERE w.target_id = ? AND n.id != ?
         ORDER BY n.updated_at DESC
         LIMIT ?`
      )
      .all(noteId, noteId, limit) as any[]
    return rows.map((row) => ({
      source_id: row.source_id,
      source_slug: row.source_slug,
      source_title: row.source_title,
      alias: row.alias ?? undefined,
    }))
  } finally {
    db.close()
  }
}
