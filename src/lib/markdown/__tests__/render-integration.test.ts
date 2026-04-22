import { describe, it, expect } from 'vitest'
import { renderMarkdownToHtml } from '../render'
import type { WikilinkResolver } from '../resolve-wikilinks'

// End-to-end check: markdown → preprocess (wikilink resolution) → remark → rehype → HTML.
// This is what the slug routes actually call.

const resolver: WikilinkResolver = (target) => {
  if (target.toLowerCase() === 'linked note') {
    return { slug: 'linked-note', title: 'Linked Note' }
  }
  return null
}

describe('renderMarkdownToHtml — wikilink pipeline integration', () => {
  it('resolved wikilink survives through remark+rehype as a real anchor', async () => {
    const html = await renderMarkdownToHtml('See [[Linked Note|details]] here.', {
      resolver,
      hrefFor: (slug) => `/meshblog/notes/${slug}`,
    })
    expect(html).toContain('<a href="/meshblog/notes/linked-note">details</a>')
    expect(html).not.toContain('[[')
  })

  it('unresolved wikilink becomes plain text (no broken anchor, no silent 404)', async () => {
    const html = await renderMarkdownToHtml('Refers to [[Missing Page]].', { resolver })
    expect(html).toContain('Missing Page')
    expect(html).not.toContain('[[')
    expect(html).not.toContain('<a href')
  })

  it('image embed is emitted as a real <img> tag after remark', async () => {
    const html = await renderMarkdownToHtml('![[diagram.png|a caption]]', { resolver })
    expect(html).toContain('<img')
    expect(html).toContain('src="diagram.png"')
    expect(html).toContain('alt="a caption"')
  })

  it('fallback path (no resolver) does not emit broken anchors', async () => {
    const html = await renderMarkdownToHtml('Before [[Anything]] after.')
    expect(html).toContain('Anything')
    expect(html).not.toContain('<a href')
    expect(html).not.toContain('[[')
  })
})
