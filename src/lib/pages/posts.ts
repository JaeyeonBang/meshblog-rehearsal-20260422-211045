// posts.ts — public blog post reader
//
// "Posts" are notes whose folder_path matches the posts directory.
// Convention (from seed.sql and plan §Task 1 Step 2):
//   folder_path = 'content/posts'  (vault-relative, no leading slash)
// If a vault uses a leading slash ('/posts'), that variant is NOT matched here.
// Adjust POSTS_FOLDER if your Obsidian vault uses a different path.
//
// level_pin: also present on the schema (INTEGER, frontmatter override 1|2|3|NULL)
// but posts vs notes is primarily discriminated by folder_path, not level_pin.
// level_pin drives display prominence within posts (L1 = featured), not inclusion.

import { openReadonlyDb } from './db'

export type PostRow = {
  id: string
  slug: string
  title: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
  level_pin: number | null
}

const POSTS_FOLDER = 'content/posts'

function parseRow(row: any): PostRow {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }
}

export function listPosts(): PostRow[] {
  const db = openReadonlyDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT id, slug, title, content, tags, created_at, updated_at, level_pin
         FROM notes
         WHERE folder_path = ?
         ORDER BY created_at DESC`
      )
      .all(POSTS_FOLDER) as any[]
    return rows.map(parseRow)
  } finally {
    db.close()
  }
}

export function getPostBySlug(slug: string): PostRow | null {
  const db = openReadonlyDb()
  if (!db) return null
  try {
    const row = db
      .prepare(
        `SELECT id, slug, title, content, tags, created_at, updated_at, level_pin
         FROM notes
         WHERE slug = ? AND folder_path = ?
         LIMIT 1`
      )
      .get(slug, POSTS_FOLDER) as any
    return row ? parseRow(row) : null
  } finally {
    db.close()
  }
}
