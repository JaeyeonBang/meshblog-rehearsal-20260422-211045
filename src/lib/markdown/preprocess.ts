import { resolveWikilinks, type WikilinkResolver } from './resolve-wikilinks'

export interface PreprocessOptions {
  resolver?: WikilinkResolver
  hrefFor?: (slug: string) => string
}

// Missing resolver → every wikilink is treated as broken and rendered as plain
// display text (alias or target). Safe for fixture/test paths where the notes
// DB is not wired, and preserves the "no silent 404" contract.
const neverResolves: WikilinkResolver = () => null

export function preprocessMarkdown(raw: string, opts: PreprocessOptions = {}): string {
  const resolver = opts.resolver ?? neverResolves
  return resolveWikilinks(raw, resolver, opts.hrefFor)
}
