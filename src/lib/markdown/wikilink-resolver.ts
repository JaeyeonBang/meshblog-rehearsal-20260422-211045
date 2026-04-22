// Build a case-insensitive wikilink resolver from a flat list of notes.
// Matches title first, then slug — mirrors Obsidian's own lookup priority.
// Aliases (frontmatter `aliases:`) are v2 scope.

import type { WikilinkResolver, WikilinkTarget } from './resolve-wikilinks'

export function buildNoteResolver(
  notes: ReadonlyArray<{ slug: string; title: string }>,
): WikilinkResolver {
  const byTitle = new Map<string, WikilinkTarget>()
  const bySlug = new Map<string, WikilinkTarget>()

  for (const n of notes) {
    const entry: WikilinkTarget = { slug: n.slug, title: n.title }
    byTitle.set(n.title.trim().toLowerCase(), entry)
    bySlug.set(n.slug.trim().toLowerCase(), entry)
  }

  return (target) => {
    const key = target.trim().toLowerCase()
    if (!key) return null
    return byTitle.get(key) ?? bySlug.get(key) ?? null
  }
}
