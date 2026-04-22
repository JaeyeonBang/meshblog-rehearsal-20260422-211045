// related.ts — entity-overlap based related notes
//
// Schema: note_entities(note_id, entity_id) — junction table.
// Strategy: for a given note, find other notes that share the most entities,
// ranked by shared entity count descending, then by updated_at descending.
// The input note itself is excluded via the JOIN predicate.

import { openReadonlyDb } from './db'

export type RelatedNote = {
  id: string
  slug: string
  title: string
  score: number  // shared entity count
}

export function getRelatedNotes(noteId: string, limit = 3): RelatedNote[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT n.id, n.slug, n.title, COUNT(DISTINCT ne2.entity_id) AS score
         FROM note_entities ne1
         JOIN note_entities ne2
           ON ne1.entity_id = ne2.entity_id
          AND ne2.note_id != ne1.note_id
         JOIN notes n ON n.id = ne2.note_id
         WHERE ne1.note_id = ?
         GROUP BY n.id
         ORDER BY score DESC, n.updated_at DESC
         LIMIT ?`
      )
      .all(noteId, limit) as RelatedNote[]
    return rows
  } finally {
    db.close()
  }
}
