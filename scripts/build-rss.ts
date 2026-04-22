/**
 * build-rss.ts — Atom 1.0 feed generator
 *
 * Reads posts from DB via listPosts(), produces public/atom.xml.
 * Posts only (not notes). Hand-rolled XML — no external dep.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { listPosts } from '../src/lib/pages/posts'

// TODO: read from astro.config once env path stabilizes
const SITE =
  process.env.PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://jaeyeonbang.github.io/meshblog'

// ── XML escape helper ─────────────────────────────────────────────────────────
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── Strip markdown/HTML and truncate for summary ─────────────────────────────
function buildSummary(content: string, maxLen = 200): string {
  const stripped = content
    .replace(/!\[.*?\]\(.*?\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/[*_~`#>|-]+/g, '') // markdown symbols
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length <= maxLen ? stripped : stripped.slice(0, maxLen - 1) + '…'
}

// ── Ensure ISO 8601 format for Atom <updated> ─────────────────────────────────
function toIso(dateStr: string): string {
  // If the DB already gives us ISO, just ensure it ends with Z
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

function main() {
  const posts = listPosts()

  const newestDate =
    posts.length > 0
      ? posts.reduce((acc, p) => (p.updated_at > acc ? p.updated_at : acc), posts[0].updated_at)
      : new Date().toISOString()

  const entries = posts
    .map((p) => {
      const href = `${SITE}/posts/${encodeURIComponent(p.slug)}/`
      const id = `${SITE}/posts/${p.slug}/`
      const updated = toIso(p.updated_at)
      const summary = xmlEscape(buildSummary(p.content))
      return `  <entry>
    <title>${xmlEscape(p.title)}</title>
    <link href="${xmlEscape(href)}"/>
    <id>${xmlEscape(id)}</id>
    <updated>${updated}</updated>
    <summary>${summary}</summary>
  </entry>`
    })
    .join('\n')

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>meshblog</title>
  <link href="${xmlEscape(`${SITE}/atom.xml`)}" rel="self"/>
  <link href="${xmlEscape(`${SITE}/`)}"/>
  <id>${xmlEscape(`${SITE}/`)}</id>
  <updated>${toIso(newestDate)}</updated>
${entries}
</feed>
`

  mkdirSync('public', { recursive: true })
  writeFileSync('public/atom.xml', feed, 'utf-8')
  console.log(`[build-rss] wrote public/atom.xml with ${posts.length} entries`)
}

try {
  main()
} catch (err) {
  console.error('[build-rss] failed:', err)
  process.exit(1)
}
