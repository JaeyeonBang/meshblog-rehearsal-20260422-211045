#!/usr/bin/env tsx
/**
 * scripts/new-post.ts
 * Scaffold a new note in content/notes/ with standard frontmatter.
 * New notes are draft:true by default so they won't appear in production
 * until the author explicitly flips the flag.
 *
 * Usage:
 *   bun run new-post "My Note Title"
 *   tsx scripts/new-post.ts "My Note Title"
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

// ── exported helpers (used by tests) ─────────────────────────────────────────

/**
 * Convert a free-form title to a URL-safe kebab-case slug.
 * 1. Normalise unicode (NFC).
 * 2. Strip emoji and non-BMP characters.
 * 3. Lowercase.
 * 4. Replace non-alphanumeric runs with a single hyphen.
 * 5. Trim leading/trailing hyphens.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFC')
    // Remove emoji / surrogate pairs (characters outside BMP)
    .replace(/[\u{1F000}-\u{10FFFF}]/gu, '')
    .toLowerCase()
    // Replace any sequence of non-alphanumeric, non-ASCII chars with '-'
    .replace(/[^a-z0-9\u00C0-\u024F]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled'
}

/**
 * Build the frontmatter + body template string for a new note.
 */
export function buildTemplate(title: string): string {
  return `---
title: "${title.replace(/"/g, '\\"')}"
draft: true
tags: []
aliases: []
level_pin: null
---

# ${title}

`
}

// ── main ──────────────────────────────────────────────────────────────────────

async function promptTitle(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question('Note title: ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main(): Promise<void> {
  const ROOT = new URL('..', import.meta.url).pathname

  // Accept title as argv[2], otherwise prompt interactively
  let title = process.argv[2]?.trim() ?? ''
  if (!title) {
    title = await promptTitle()
  }
  if (!title) {
    console.error('[new-post] ERROR: title cannot be empty')
    process.exit(1)
  }

  const slug = slugify(title)
  const notesDir = join(ROOT, 'content', 'notes')
  const outPath = join(notesDir, `${slug}.md`)

  if (existsSync(outPath)) {
    console.error(`[new-post] ERROR: file already exists — ${outPath}`)
    console.error('[new-post] Rename the existing file or choose a different title.')
    process.exit(1)
  }

  mkdirSync(notesDir, { recursive: true })
  writeFileSync(outPath, buildTemplate(title), 'utf-8')
  console.log(`[new-post] created ${outPath}`)
}

main().catch((err) => {
  console.error('[new-post] fatal:', err)
  process.exit(1)
})
