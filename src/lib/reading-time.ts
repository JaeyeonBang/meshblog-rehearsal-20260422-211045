// reading-time.ts — rough reading time estimate
//
// English: 238 wpm (average adult reading speed)
// Korean:  400 chars/min (Hangul is denser per character)
// Auto-detect by Hangul ratio (same heuristic as Base.astro inferLang).
// Strips markdown syntax before counting to avoid inflating word count.

export function estimateReadingMinutes(markdown: string): number {
  // Strip common markdown syntax tokens that are not real words
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')   // fenced code blocks
    .replace(/`[^`]+`/g, ' ')          // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images — keep label text
    .replace(/^#{1,6}\s+/gm, '')       // heading markers
    .replace(/[*_~>|#\-=]/g, ' ')      // emphasis, hr, table, blockquote chars

  const koChars = (stripped.match(/[\uAC00-\uD7AF]/g) ?? []).length
  const enWords = (stripped.match(/[A-Za-z]+/g) ?? []).length
  const koMinutes = koChars / 400
  const enMinutes = enWords / 238
  const total = koMinutes + enMinutes
  return Math.max(1, Math.round(total))
}
