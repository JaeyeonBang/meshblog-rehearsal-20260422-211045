/**
 * Task 12 — Test 8: cosine similarity helpers
 */
import { describe, it, expect } from "vitest"
import { cosine, topKByCosine } from "../../src/lib/llm/cosine.ts"

describe("cosine()", () => {
  it("cosine(a, a) === 1 for a non-zero vector", () => {
    const a = [1, 0, 0.5, -0.3]
    expect(cosine(a, a)).toBeCloseTo(1, 8)
  })

  it("cosine of orthogonal vectors === 0", () => {
    const a = [1, 0]
    const b = [0, 1]
    expect(cosine(a, b)).toBeCloseTo(0, 8)
  })

  it("cosine of opposite vectors === -1", () => {
    const a = [1, 0]
    const b = [-1, 0]
    expect(cosine(a, b)).toBeCloseTo(-1, 8)
  })

  it("returns 0 for zero-length input", () => {
    expect(cosine([], [])).toBe(0)
  })

  it("returns 0 for mismatched lengths", () => {
    expect(cosine([1, 2], [1])).toBe(0)
  })

  it("returns 0 for zero-magnitude vector", () => {
    const a = [0, 0, 0]
    const b = [1, 2, 3]
    expect(cosine(a, b)).toBe(0)
  })

  it("ranks similar vector higher than dissimilar", () => {
    const query = [1, 0, 0]
    const similar = [0.9, 0.1, 0]
    const dissimilar = [0, 0, 1]
    expect(cosine(query, similar)).toBeGreaterThan(cosine(query, dissimilar))
  })
})

describe("topKByCosine()", () => {
  it("returns top-k in descending order", () => {
    const query = [1, 0]
    const candidates = [
      { id: "a", embedding: [0, 1] },  // score ≈ 0
      { id: "b", embedding: [1, 0] },  // score = 1
      { id: "c", embedding: [0.7, 0.7] }, // score ≈ 0.707
    ]
    const results = topKByCosine(query, candidates, 2)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe("b")
    expect(results[1].id).toBe("c")
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it("returns all candidates if k >= length", () => {
    const query = [1, 0]
    const candidates = [
      { id: "x", embedding: [1, 0] },
      { id: "y", embedding: [0, 1] },
    ]
    expect(topKByCosine(query, candidates, 10)).toHaveLength(2)
  })

  it("returns empty array for empty candidates", () => {
    expect(topKByCosine([1, 0], [], 5)).toEqual([])
  })

  it("each result has a score property", () => {
    const query = [1, 0]
    const candidates = [{ id: "a", embedding: [1, 0] }]
    const results = topKByCosine(query, candidates, 1)
    expect(typeof results[0].score).toBe("number")
  })
})
