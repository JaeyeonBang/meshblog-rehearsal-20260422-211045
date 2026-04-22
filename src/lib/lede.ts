/**
 * Inject a `lede` class onto the first suitable <p> in rendered HTML.
 *
 * Strategy:
 * 1. If the HTML starts with a <p> (markdown opened with a paragraph), tag it.
 * 2. Fallback: scan for the first <p>…</p> block whose text content is >50 chars
 *    and promote it. This handles markdown that opens with a heading (#, ##, …).
 * 3. If no suitable paragraph exists, return HTML unchanged (lede omitted
 *    gracefully — eyebrow + reader-meta still render unconditionally).
 */
export function injectLedeClass(html: string): string {
  // Primary: content starts with a paragraph
  if (/^\s*<p>/.test(html)) {
    return html.replace(/^(\s*)<p>/, '$1<p class="lede">')
  }
  // Fallback: first <p>…</p> with >50 chars of text content
  return html.replace(/<p>([^]*?)<\/p>/, (match, inner) => {
    const textLen = inner.replace(/<[^>]+>/g, '').length
    return textLen > 50 ? `<p class="lede">${inner}</p>` : match
  })
}
