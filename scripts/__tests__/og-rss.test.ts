/**
 * og-rss.test.ts — Task 7' integration tests
 *
 * Verifies:
 *  1. `bun run build-og` exits 0 and writes a valid PNG to public/og/index.png
 *  2. `bun run build-rss` exits 0 and writes a valid Atom feed to public/atom.xml
 *
 * Uses a dedicated fixture DB (MESHBLOG_DB=.data/test-og.db) so the live DB
 * is never touched. Falls back gracefully when DB is absent (script still exits 0).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '../..')
const TEST_DB = join(REPO_ROOT, '.data/test-og.db')
const OG_INDEX_PNG = join(REPO_ROOT, 'public/og/index.png')
const ATOM_XML = join(REPO_ROOT, 'public/atom.xml')

function runCmd(cmd: string, extra: Record<string, string> = {}): string {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, MESHBLOG_DB: TEST_DB, ...extra },
    encoding: 'utf-8',
  })
}

describe('build-og + build-rss', () => {
  beforeAll(() => {
    // Clean up any stale test DB
    for (const path of [TEST_DB, TEST_DB + '-shm', TEST_DB + '-wal']) {
      if (existsSync(path)) unlinkSync(path)
    }

    // Seed a fixture DB so posts/notes are available
    runCmd('bun run build-index', { FIXTURE_ONLY: '1' })
  }, 60000)

  afterAll(() => {
    for (const path of [TEST_DB, TEST_DB + '-shm', TEST_DB + '-wal']) {
      if (existsSync(path)) unlinkSync(path)
    }
  })

  // ── OG cards ──────────────────────────────────────────────────────────────

  it('build-og exits 0', () => {
    expect(() => runCmd('bun run build-og')).not.toThrow()
  })

  it('public/og/index.png exists after build-og', () => {
    runCmd('bun run build-og')
    expect(existsSync(OG_INDEX_PNG)).toBe(true)
  })

  it('public/og/index.png starts with PNG magic bytes', () => {
    runCmd('bun run build-og')
    const buf = readFileSync(OG_INDEX_PNG)
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89)
    expect(buf[1]).toBe(0x50) // P
    expect(buf[2]).toBe(0x4e) // N
    expect(buf[3]).toBe(0x47) // G
  })

  it('public/og/index.png is larger than 1 byte (real PNG, not placeholder)', () => {
    runCmd('bun run build-og')
    const buf = readFileSync(OG_INDEX_PNG)
    // A real 1200×630 PNG should be much larger than a 1×1 placeholder (~80 bytes)
    expect(buf.length).toBeGreaterThan(100)
  })

  // ── RSS / Atom ─────────────────────────────────────────────────────────────

  it('build-rss exits 0', () => {
    expect(() => runCmd('bun run build-rss')).not.toThrow()
  })

  it('public/atom.xml exists after build-rss', () => {
    runCmd('bun run build-rss')
    expect(existsSync(ATOM_XML)).toBe(true)
  })

  it('atom.xml contains Atom namespace declaration', () => {
    runCmd('bun run build-rss')
    const xml = readFileSync(ATOM_XML, 'utf-8')
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
  })

  it('atom.xml contains required feed-level elements', () => {
    runCmd('bun run build-rss')
    const xml = readFileSync(ATOM_XML, 'utf-8')
    expect(xml).toContain('<title>meshblog</title>')
    expect(xml).toContain('rel="self"')
    expect(xml).toContain('<id>')
    expect(xml).toContain('<updated>')
  })

  it('atom.xml <updated> matches ISO 8601 format', () => {
    runCmd('bun run build-rss')
    const xml = readFileSync(ATOM_XML, 'utf-8')
    const match = xml.match(/<updated>([\d\-T:.Z]+)<\/updated>/)
    expect(match).not.toBeNull()
    expect(match![1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('atom.xml has at least 0 entries (feed structure valid even with no posts)', () => {
    runCmd('bun run build-rss')
    const xml = readFileSync(ATOM_XML, 'utf-8')
    // Structural sanity: well-formed open/close feed tags
    expect(xml.trimStart()).toMatch(/^<\?xml version="1\.0"/)
    expect(xml).toContain('</feed>')
  })

  it('each <entry> in atom.xml has <title>, <link>, <id>, <updated>, <summary>', () => {
    runCmd('bun run build-rss')
    const xml = readFileSync(ATOM_XML, 'utf-8')
    const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []

    for (const block of entryBlocks) {
      expect(block).toContain('<title>')
      expect(block).toContain('<link ')
      expect(block).toContain('<id>')
      expect(block).toContain('<updated>')
      expect(block).toContain('<summary>')
    }
  })
})
