/**
 * url.ts — BASE_URL-aware path helper.
 *
 * Astro's `import.meta.env.BASE_URL` is `/` in dev, `/meshblog/` on gh-pages.
 * Use this to prefix root-absolute links in pages and client islands so the
 * same code works in both contexts.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function withBase(path: string): string {
  if (!path || path.startsWith('http') || path.startsWith('#')) return path
  const rooted = path.startsWith('/') ? path : `/${path}`
  return `${BASE}${rooted}`
}
