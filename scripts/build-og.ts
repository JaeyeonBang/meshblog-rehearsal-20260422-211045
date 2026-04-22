/**
 * build-og.ts — Static OG card (1200×630 PNG) generator
 *
 * Reads posts + notes from DB, renders an SVG template per item,
 * converts to PNG via @resvg/resvg-js (native), writes to public/og/.
 *
 * ED6 safety: main() is wrapped in try/catch. If resvg fails on any item,
 * a 1×1 fallback placeholder PNG is written instead. The whole build
 * still exits 0 so the Astro build is never blocked.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { listPosts } from '../src/lib/pages/posts'
import { listNotes } from '../src/lib/pages/notes'

// ── PNG magic-bytes fallback (1×1 transparent PNG) ──────────────────────────
// Generated once; reused on resvg failure per item.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

// ── XML escape helpers ───────────────────────────────────────────────────────
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(s: string, max = 60): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

// ── SVG template ─────────────────────────────────────────────────────────────
function buildSvg(title: string): string {
  // Hex values below are intentional duplicates of the OKLCH design tokens in
  // tokens.css, approximated for SVG/PNG output (SVG cannot resolve CSS custom
  // properties at resvg render time):
  //   #f6f4ef ≈ oklch(0.982 0.008 85)  — warm near-white background
  //   #2a2620 ≈ oklch(0.18 0.012 60)   — near-black warm title
  //   #d1cbbd ≈ oklch(0.81 0.014 80)   — warm muted divider rule
  //   #8a8270 ≈ oklch(0.55 0.018 75)   — muted warm label
  //   #6e6658 ≈ oklch(0.46 0.018 75)   — muted warm subtitle
  const safeTitle = xmlEscape(truncate(title))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#f6f4ef"/>
  <text x="80" y="200" font-family="Georgia, 'Times New Roman', serif" font-size="80" font-weight="500" fill="#2a2620">${safeTitle}</text>
  <text x="80" y="256" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-style="italic" fill="#6e6658">— an ongoing journal</text>
  <rect width="1200" height="1" y="570" fill="#d1cbbd"/>
  <text x="80" y="595" font-family="sans-serif" font-size="20" font-weight="400" fill="#8a8270" letter-spacing="6">MESHBLOG</text>
</svg>`
}

// ── SVG → PNG conversion ──────────────────────────────────────────────────────
function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  })
  return Buffer.from(resvg.render().asPng())
}

function writePng(outPath: string, svg: string): void {
  let png: Buffer
  try {
    png = svgToPng(svg)
  } catch (err) {
    console.warn(`[build-og] resvg failed for ${outPath}, writing placeholder:`, err)
    png = PLACEHOLDER_PNG
  }
  writeFileSync(outPath, png)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync('public/og/posts', { recursive: true })
  mkdirSync('public/og/notes', { recursive: true })

  // Homepage card
  const homeSvg = buildSvg('meshblog')
  writePng('public/og/index.png', homeSvg)
  console.log('[build-og] wrote public/og/index.png')

  // Posts
  const posts = listPosts()
  for (const post of posts) {
    const svg = buildSvg(post.title)
    const outPath = join('public/og/posts', `${encodeURIComponent(post.slug)}.png`)
    writePng(outPath, svg)
  }
  console.log(`[build-og] wrote ${posts.length} post OG images`)

  // Notes
  const notes = listNotes()
  for (const note of notes) {
    const svg = buildSvg(note.title)
    const outPath = join('public/og/notes', `${encodeURIComponent(note.slug)}.png`)
    writePng(outPath, svg)
  }
  console.log(`[build-og] wrote ${notes.length} note OG images`)

  console.log('[build-og] done')
}

main().catch((err) => {
  console.warn('[build-og] unexpected error (non-fatal):', err)
  // ED6: never block the build
  process.exit(0)
})
