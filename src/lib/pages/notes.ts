// notes.ts — private/second-brain note reader
//
// "Notes" are entries whose folder_path matches the notes directory.
// Convention (from seed.sql and plan §Task 1 Step 3):
//   folder_path = 'content/notes'  (vault-relative, no leading slash)
//
// getNoteBySlug() has NO folder_path filter so any note (post or note) can be
// fetched by slug — useful for cross-linking and graph page rendering.
//
// level_pin: present on schema (INTEGER, frontmatter override 1|2|3|NULL).
// Drives display prominence within the notes list; not used for inclusion/exclusion.

import { openReadonlyDb } from './db'

export type NoteRow = {
  id: string
  slug: string
  title: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
  level_pin: number | null
}

const NOTES_FOLDER = 'content/notes'

function parseRow(row: any): NoteRow {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }
}

export function listNotes(): NoteRow[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT id, slug, title, content, tags, created_at, updated_at, level_pin
         FROM notes
         WHERE folder_path = ?
         ORDER BY updated_at DESC`
      )
      .all(NOTES_FOLDER) as any[]
    return rows.map(parseRow)
  } finally {
    db.close()
  }
}

// Minimal projection across every linkable entry (notes + posts, any folder).
// Used by the wikilink resolver so [[X]] can target anything in the vault.
export function listAllLinkable(): Array<{ slug: string; title: string }> {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    return db
      .prepare(`SELECT slug, title FROM notes`)
      .all() as Array<{ slug: string; title: string }>
  } finally {
    db.close()
  }
}

export function getNoteBySlug(slug: string): NoteRow | null {
  const db = openReadonlyDb()
  if (!db) return null
  try {
    const row = db
      .prepare(
        `SELECT id, slug, title, content, tags, created_at, updated_at, level_pin
         FROM notes
         WHERE slug = ?
         LIMIT 1`
      )
      .get(slug) as any
    return row ? parseRow(row) : null
  } finally {
    db.close()
  }
}
