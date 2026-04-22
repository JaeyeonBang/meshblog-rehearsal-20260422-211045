// qa.ts — Q&A card reader (3-tier: note | concept | global)
//
// Schema: qa_cards(id, tier, note_id, concept_id, question, answer, content_hash, created_at)
// - tier='note'    → note_id is set, concept_id is NULL
// - tier='concept' → concept_id is set, note_id is NULL
// - tier='global'  → both note_id and concept_id are NULL
//
// The QaCard type uses scope_id (note_id or concept_id, whichever is non-null) for
// a unified interface, matching the index.ts barrel contract.

import { openReadonlyDb } from './db'

export type QaCard = {
  id: string
  tier: 'note' | 'concept' | 'global'
  question: string
  answer: string
  lang: string
  scope_id: string | null
}

function mapRow(row: any): QaCard {
  return {
    id: row.id,
    tier: row.tier,
    question: row.question,
    answer: row.answer,
    lang: row.lang ?? 'en',
    scope_id: row.note_id ?? row.concept_id ?? null,
  }
}

export function getQaGlobal(): QaCard[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT id, tier, question, answer, note_id, concept_id
         FROM qa_cards
         WHERE tier = 'global'
         ORDER BY created_at`
      )
      .all()
    return rows.map(mapRow)
  } finally {
    db.close()
  }
}

/**
 * getHomepageQa — merged + ranked list for the QA-first homepage hero.
 *
 * Returns up to `limit` cards in this order:
 *   1. tier='global'  — ordered by created_at DESC (most recent first)
 *   2. tier='concept' — joined to graph_levels, ordered by pagerank DESC
 *
 * The old getQaGlobal() is kept intact; this is additive.
 */
export function getHomepageQa(limit = 10): QaCard[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const globalRows = db
      .prepare(
        `SELECT id, tier, question, answer, note_id, concept_id
         FROM qa_cards
         WHERE tier = 'global'
         ORDER BY created_at DESC`
      )
      .all()

    const conceptRows = db
      .prepare(
        `SELECT q.id, q.tier, q.question, q.answer, q.note_id, q.concept_id
         FROM qa_cards q
         LEFT JOIN graph_levels gl
           ON gl.graph_type = 'concept' AND gl.node_id = q.concept_id
         WHERE q.tier = 'concept'
         ORDER BY COALESCE(gl.pagerank, 0) DESC`
      )
      .all()

    const merged = [...globalRows, ...conceptRows].slice(0, limit)
    return merged.map(mapRow)
  } finally {
    db.close()
  }
}

export function getQaForNote(noteId: string): QaCard[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT id, tier, question, answer, note_id, concept_id
         FROM qa_cards
         WHERE tier = 'note' AND note_id = ?
         ORDER BY created_at`
      )
      .all(noteId)
    return rows.map(mapRow)
  } finally {
    db.close()
  }
}

export function getQaForConcept(conceptId: string): QaCard[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT id, tier, question, answer, note_id, concept_id
         FROM qa_cards
         WHERE tier = 'concept' AND concept_id = ?
         ORDER BY created_at`
      )
      .all(conceptId)
    return rows.map(mapRow)
  } finally {
    db.close()
  }
}
