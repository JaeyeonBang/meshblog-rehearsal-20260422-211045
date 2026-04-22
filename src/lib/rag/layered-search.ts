/**
 * Layered search types — ported verbatim from Volla.
 * Defines the layer taxonomy used by wiki.ts and future multi-tier search.
 * user_id: N/A (type-only file, no DB calls).
 */

export const ALL_LAYERS = [
  "entities",
  "concepts",
  "meta_themes",
  "wiki",
  "notes",
  "blogs",
  "portfolio",
] as const

export type Layer = typeof ALL_LAYERS[number]

export type LayerHit = {
  id: string
  title: string
  content: string
  tags: string[]
  score: number
  layer: Layer
  source: string
}
