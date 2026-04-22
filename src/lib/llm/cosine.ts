/**
 * Pure JS cosine similarity helpers.
 * Used for in-memory vector search (replaces pgvector <=> operator).
 * See: docs/porting-rules.md rule 5 — vector math in JS, never in SQL.
 */

/**
 * Compute cosine similarity between two equal-length number arrays.
 * Returns a value in [-1, 1]. Returns 0 if either vector is zero-length or empty.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0
  return dot / denom
}

export type CandidateWithEmbedding = {
  id: string
  embedding: number[]
}

/**
 * Return the top-k candidates ranked by cosine similarity to the query embedding.
 * Each result includes the original candidate fields plus a `score` property.
 */
export function topKByCosine(
  query: number[],
  candidates: CandidateWithEmbedding[],
  k: number
): Array<CandidateWithEmbedding & { score: number }> {
  const scored = candidates.map((c) => ({
    ...c,
    score: cosine(query, c.embedding),
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, k)
}
