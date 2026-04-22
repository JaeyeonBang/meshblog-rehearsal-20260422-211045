// word-count.ts — word count and reading time helper for markdown content.
//
// Strips markdown syntax (headings, links, code, emphasis, etc.) before counting.
// Uses a fixed 200 words/min reading speed as specified.

export interface ReadingStats {
  words: number
  readingTime: number
}

/**
 * Returns word count and reading time for a markdown string.
 * Reading speed: 200 words/min (floor-div, min 1).
 */
export function getReadingStats(markdown: string): ReadingStats {
  // Strip markdown syntax so it doesn't inflate word count
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')         // fenced code blocks
    .replace(/`[^`]+`/g, ' ')               // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images — keep label text
    .replace(/^#{1,6}\s+/gm, '')            // heading markers
    .replace(/^\s*[-*+]\s+/gm, ' ')         // unordered list bullets
    .replace(/^\s*\d+\.\s+/gm, ' ')         // ordered list numbers
    .replace(/[*_~>#|=\-]/g, ' ')           // emphasis, hr, table, blockquote chars
    .replace(/\[\^[^\]]+\]/g, ' ')          // footnote references
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()

  if (!stripped) {
    return { words: 0, readingTime: 1 }
  }

  const words = stripped.split(/\s+/).filter((w) => w.length > 0).length
  const readingTime = Math.max(1, Math.floor(words / 200))

  return { words, readingTime }
}
