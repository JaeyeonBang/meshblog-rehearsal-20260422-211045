// Obsidian wikilink → Markdown/HTML resolver.
//
// Handles four shapes, matched in one pass by a single regex:
//   [[target]]            → <a href="/notes/slug">title</a>  (resolved)
//   [[target|alias]]      → <a href="/notes/slug">alias</a>  (resolved)
//   ![[src]]              → ![](src)                         (image embed)
//   ![[src|caption]]      → ![caption](src)                  (image embed with alt)
//
// When a target does not resolve, emits the display text as plain text rather
// than a broken anchor. Silent 404s on Pages deploys were the pain here, so we
// prefer visibly-unlinked text the author can grep for.

export type WikilinkTarget = { slug: string; title: string }
export type WikilinkResolver = (target: string) => WikilinkTarget | null

// `!` optional (image-embed prefix), target up to first `|` or `]`, optional
// `|alias` segment, then `]]`. Uses non-greedy matching on alias so that
// adjacent wikilinks on the same line don't collapse into one match.
const WIKILINK_RE = /(!?)\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g

const defaultHrefFor = (slug: string) => `/notes/${slug}`

export function resolveWikilinks(
  md: string,
  resolve: WikilinkResolver,
  hrefFor: (slug: string) => string = defaultHrefFor,
): string {
  return md.replace(WIKILINK_RE, (_match, bang: string, rawTarget: string, rawAlias?: string) => {
    const target = (rawTarget ?? '').trim()
    const alias = rawAlias?.trim() ?? ''

    if (bang === '!') {
      // Image embed: target is the src; alias (if any) is the alt/caption.
      return `![${alias}](${target})`
    }

    // Regular wikilink.
    if (!target) {
      // [[|alias]] or [[]] — no lookup possible; fall back to alias text or empty.
      return alias
    }

    const resolved = resolve(target)
    const display = alias || resolved?.title || target

    if (!resolved) {
      return display
    }

    return `<a href="${hrefFor(resolved.slug)}">${display}</a>`
  })
}
