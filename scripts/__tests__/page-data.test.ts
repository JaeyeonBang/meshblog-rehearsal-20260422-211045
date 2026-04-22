/**
 * page-data.test.ts — Task 1-C: page-data helper integration tests.
 *
 * Tests all 4 page-data modules: posts, notes, qa, related.
 *
 * Strategy: spins up a dedicated fixture DB (FIXTURE_ONLY=1 bun run build-index),
 * then points MESHBLOG_DB at it so openReadonlyDb() returns the fixture data.
 *
 * The fixture DB is seeded from test/fixtures/seed.sql:
 *   - 5 notes in 'content/notes'
 *   - 30 qa_cards (25 note-tier, 3 concept-tier, 2 global-tier)
 *   - note_entities cross-references for entity-overlap based related notes
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '../..')
const TEST_DB = join(REPO_ROOT, '.data/test-page-data.db')

// Point openReadonlyDb() at the fixture DB for all imports below.
process.env.MESHBLOG_DB = TEST_DB

// Imports AFTER setting MESHBLOG_DB so the module-level DB_PATH picks it up.
const { listPosts, getPostBySlug } = await import('../../src/lib/pages/posts.js')
const { listNotes, getNoteBySlug } = await import('../../src/lib/pages/notes.js')
const { getQaGlobal, getQaForNote, getQaForConcept } = await import('../../src/lib/pages/qa.js')
const { getRelatedNotes } = await import('../../src/lib/pages/related.js')

function cleanDb() {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  for (const ext of ['-shm', '-wal']) {
    const f = TEST_DB + ext
    if (existsSync(f)) unlinkSync(f)
  }
}

beforeAll(() => {
  cleanDb()
  execSync('bun run build-index', {
    cwd: REPO_ROOT,
    env: { ...process.env, MESHBLOG_DB: TEST_DB, FIXTURE_ONLY: '1' },
    encoding: 'utf-8',
  })
}, 30000)

afterAll(() => {
  cleanDb()
})

// ── posts ────────────────────────────────────────────────────────────────────

describe('listPosts()', () => {
  it('returns an array without throwing', () => {
    const posts = listPosts()
    expect(Array.isArray(posts)).toBe(true)
  })

  it('all rows have required fields', () => {
    const posts = listPosts()
    for (const p of posts) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.slug).toBe('string')
      expect(typeof p.title).toBe('string')
      expect(Array.isArray(p.tags)).toBe(true)
    }
  })
})

describe('getPostBySlug()', () => {
  it('returns null for a non-existent slug', () => {
    expect(getPostBySlug('__nonexistent_slug__')).toBeNull()
  })
})

// ── notes ────────────────────────────────────────────────────────────────────

describe('listNotes()', () => {
  it('returns an array without throwing', () => {
    const notes = listNotes()
    expect(Array.isArray(notes)).toBe(true)
  })

  it('fixture notes are present (≥5)', () => {
    const notes = listNotes()
    expect(notes.length).toBeGreaterThanOrEqual(5)
  })
})

describe('getNoteBySlug()', () => {
  it('returns null for a non-existent slug', () => {
    expect(getNoteBySlug('__nonexistent_slug__')).toBeNull()
  })

  it('returns matching row for existing slug', () => {
    const note = getNoteBySlug('fixture-ts-generics')
    expect(note).not.toBeNull()
    expect(note!.slug).toBe('fixture-ts-generics')
    expect(typeof note!.title).toBe('string')
    expect(Array.isArray(note!.tags)).toBe(true)
  })
})

// ── qa ───────────────────────────────────────────────────────────────────────

describe('getQaGlobal()', () => {
  it('returns an array without throwing', () => {
    const cards = getQaGlobal()
    expect(Array.isArray(cards)).toBe(true)
  })

  it('every card has tier === global', () => {
    const cards = getQaGlobal()
    expect(cards.length).toBeGreaterThanOrEqual(2)
    for (const c of cards) {
      expect(c.tier).toBe('global')
    }
  })

  it('global cards have null scope_id', () => {
    const cards = getQaGlobal()
    for (const c of cards) {
      expect(c.scope_id).toBeNull()
    }
  })
})

describe('getQaForNote()', () => {
  it('returns array filtered to tier=note for known note', () => {
    const cards = getQaForNote('fixture-ts-generics')
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThanOrEqual(1)
    for (const c of cards) {
      expect(c.tier).toBe('note')
      expect(c.scope_id).toBe('fixture-ts-generics')
    }
  })

  it('returns empty array for unknown note', () => {
    const cards = getQaForNote('__no_such_note__')
    expect(cards).toEqual([])
  })
})

describe('getQaForConcept()', () => {
  it('returns array filtered to tier=concept for known concept', () => {
    const conceptId = 'c0000001-0000-0000-0000-000000000001'
    const cards = getQaForConcept(conceptId)
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeGreaterThanOrEqual(1)
    for (const c of cards) {
      expect(c.tier).toBe('concept')
      expect(c.scope_id).toBe(conceptId)
    }
  })

  it('returns empty array for unknown concept', () => {
    const cards = getQaForConcept('__no_such_concept__')
    expect(cards).toEqual([])
  })
})

// ── related ──────────────────────────────────────────────────────────────────

describe('getRelatedNotes()', () => {
  it('returns at most limit results', () => {
    const related = getRelatedNotes('fixture-rag-overview', 3)
    expect(related.length).toBeLessThanOrEqual(3)
  })

  it('does not include the input note itself', () => {
    const noteId = 'fixture-rag-overview'
    const related = getRelatedNotes(noteId, 5)
    for (const r of related) {
      expect(r.id).not.toBe(noteId)
    }
  })

  it('returns an array without throwing for a note with no entities', () => {
    const related = getRelatedNotes('__no_such_note__', 3)
    expect(Array.isArray(related)).toBe(true)
    expect(related.length).toBe(0)
  })

  it('default limit of 3 is respected', () => {
    const related = getRelatedNotes('fixture-rag-overview')
    expect(related.length).toBeLessThanOrEqual(3)
  })

  it('related notes have required fields with numeric score', () => {
    const related = getRelatedNotes('fixture-rag-overview', 3)
    for (const r of related) {
      expect(typeof r.id).toBe('string')
      expect(typeof r.slug).toBe('string')
      expect(typeof r.title).toBe('string')
      expect(typeof r.score).toBe('number')
      expect(r.score).toBeGreaterThan(0)
    }
  })
})
