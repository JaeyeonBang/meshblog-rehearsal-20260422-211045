import { describe, it, expect } from 'vitest'
import { buildNoteResolver } from '../wikilink-resolver'

const notes = [
  { slug: 'prisma-vs-drizzle', title: 'Prisma vs Drizzle' },
  { slug: '03-astro-basics', title: 'Astro Basics' },
  { slug: 'unicode-note', title: '한글 메모' },
]

describe('buildNoteResolver', () => {
  it('resolves by exact title (case-insensitive)', () => {
    const resolve = buildNoteResolver(notes)
    expect(resolve('Prisma vs Drizzle')).toEqual({
      slug: 'prisma-vs-drizzle',
      title: 'Prisma vs Drizzle',
    })
    expect(resolve('prisma vs drizzle')).toEqual({
      slug: 'prisma-vs-drizzle',
      title: 'Prisma vs Drizzle',
    })
  })

  it('falls back to slug when title does not match', () => {
    const resolve = buildNoteResolver(notes)
    expect(resolve('03-astro-basics')).toEqual({
      slug: '03-astro-basics',
      title: 'Astro Basics',
    })
  })

  it('unknown target → null', () => {
    const resolve = buildNoteResolver(notes)
    expect(resolve('Does Not Exist')).toBeNull()
  })

  it('empty string → null (never matches)', () => {
    const resolve = buildNoteResolver(notes)
    expect(resolve('')).toBeNull()
    expect(resolve('   ')).toBeNull()
  })

  it('unicode titles match', () => {
    const resolve = buildNoteResolver(notes)
    expect(resolve('한글 메모')).toEqual({
      slug: 'unicode-note',
      title: '한글 메모',
    })
  })

  it('trimmed whitespace around target', () => {
    const resolve = buildNoteResolver(notes)
    expect(resolve('  Astro Basics  ')).toEqual({
      slug: '03-astro-basics',
      title: 'Astro Basics',
    })
  })
})
