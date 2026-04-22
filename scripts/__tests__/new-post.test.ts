/**
 * scripts/__tests__/new-post.test.ts
 * Unit tests for scripts/new-post.ts helpers.
 *
 * Tests:
 *  1. slugify — spaces, unicode, emoji, punctuation
 *  2. buildTemplate — correct YAML frontmatter (parsed with gray-matter)
 *  3. No-overwrite guard — exits 1 when target file already exists
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import matter from 'gray-matter'

import { slugify, buildTemplate } from '../new-post.ts'

// ── slugify ───────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  -- Spaces Around --  ')).toBe('spaces-around')
  })

  it('collapses multiple separators into one hyphen', () => {
    expect(slugify('foo   bar---baz')).toBe('foo-bar-baz')
  })

  it('removes emoji', () => {
    expect(slugify('Hello 🌍 World')).toBe('hello-world')
  })

  it('removes emoji-only title → "untitled"', () => {
    expect(slugify('🎉🎊')).toBe('untitled')
  })

  it('handles punctuation (strips it)', () => {
    expect(slugify("It's a test! (really)")).toBe('it-s-a-test-really')
  })

  it('preserves ASCII digits', () => {
    expect(slugify('Part 2: The Sequel')).toBe('part-2-the-sequel')
  })

  it('handles empty string → "untitled"', () => {
    expect(slugify('')).toBe('untitled')
  })

  it('handles unicode latin characters', () => {
    const result = slugify('Über die Straße')
    // Should not crash; should produce a non-empty slug
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toMatch(/^-|-$/)
  })
})

// ── buildTemplate ─────────────────────────────────────────────────────────────

describe('buildTemplate', () => {
  it('produces valid YAML frontmatter parseable by gray-matter', () => {
    const md = buildTemplate('My Test Note')
    const parsed = matter(md)
    expect(parsed.data.title).toBe('My Test Note')
  })

  it('sets draft: true', () => {
    const parsed = matter(buildTemplate('Draft Note'))
    expect(parsed.data.draft).toBe(true)
  })

  it('sets tags to an empty array', () => {
    const parsed = matter(buildTemplate('Tag Test'))
    expect(Array.isArray(parsed.data.tags)).toBe(true)
    expect(parsed.data.tags).toHaveLength(0)
  })

  it('sets aliases to an empty array', () => {
    const parsed = matter(buildTemplate('Alias Test'))
    expect(Array.isArray(parsed.data.aliases)).toBe(true)
    expect(parsed.data.aliases).toHaveLength(0)
  })

  it('sets level_pin to null', () => {
    const parsed = matter(buildTemplate('Level Test'))
    expect(parsed.data.level_pin).toBeNull()
  })

  it('includes H1 heading in body', () => {
    const md = buildTemplate('Heading Test')
    const parsed = matter(md)
    expect(parsed.content.trim()).toContain('# Heading Test')
  })

  it('escapes double-quotes in title', () => {
    const md = buildTemplate('She said "hello"')
    // Must not break YAML parsing
    const parsed = matter(md)
    expect(parsed.data.title).toBe('She said "hello"')
  })
})

// ── no-overwrite guard ────────────────────────────────────────────────────────

describe('new-post.ts CLI — no-overwrite guard', () => {
  let tmpDir: string
  const REPO_ROOT = join(import.meta.dirname, '../..')

  beforeEach(() => {
    tmpDir = join(tmpdir(), `new-post-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('exits 1 when target file already exists', () => {
    // Slug for "Existing Note" → "existing-note"
    const slug = 'existing-note'
    const notesDir = join(tmpDir, 'content', 'notes')
    mkdirSync(notesDir, { recursive: true })
    writeFileSync(join(notesDir, `${slug}.md`), '# already here\n', 'utf-8')

    // Point MESHBLOG_NOTES_DIR at the temp directory so the script
    // won't touch the real content/notes/.  We achieve this by
    // overriding the CWD to tmpDir (the script resolves ROOT from
    // import.meta.url, so we also pass the title that slugifies to an
    // existing file in that dir).
    //
    // Because the script uses import.meta.url to find ROOT, we drive
    // it via a small wrapper that patches the resolved path.
    // Simpler: use execSync with the actual repo, but point the
    // output at a path that already exists by creating it first.

    // Create the collision in the real content/notes/ (cleaned up in afterEach)
    const realNotesDir = join(REPO_ROOT, 'content', 'notes')
    mkdirSync(realNotesDir, { recursive: true })
    const realTarget = join(realNotesDir, `${slug}.md`)
    const alreadyExisted = existsSync(realTarget)
    if (!alreadyExisted) {
      writeFileSync(realTarget, '# collision\n', 'utf-8')
    }

    try {
      let threw = false
      try {
        execSync(`bun run scripts/new-post.ts "Existing Note"`, {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          stdio: 'pipe',
        })
      } catch (err: any) {
        threw = true
        expect(err.status).toBe(1)
        expect(err.stderr).toContain('already exists')
      }
      expect(threw).toBe(true)
    } finally {
      // Clean up only if we created it
      if (!alreadyExisted && existsSync(realTarget)) {
        rmSync(realTarget)
      }
    }
  })

  it('exits 0 and creates file for a fresh title', () => {
    const realNotesDir = join(REPO_ROOT, 'content', 'notes')
    mkdirSync(realNotesDir, { recursive: true })
    const slug = `new-post-test-${Date.now()}`
    const target = join(realNotesDir, `${slug}.md`)

    // Ensure it doesn't exist
    if (existsSync(target)) rmSync(target)

    try {
      const title = slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

      execSync(`bun run scripts/new-post.ts "${title}"`, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      expect(existsSync(target)).toBe(true)

      const parsed = matter(readFileSync(target, 'utf-8'))
      expect(parsed.data.draft).toBe(true)
      expect(parsed.data.title).toBe(title)
    } finally {
      if (existsSync(target)) rmSync(target)
    }
  })
})
