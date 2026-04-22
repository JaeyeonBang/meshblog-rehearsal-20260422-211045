/**
 * Task 12 — Test 9: embeddingToBlob / blobToEmbedding round-trip
 */
import { describe, it, expect } from "vitest"
import { embeddingToBlob, blobToEmbedding } from "../../src/lib/rag/embed.ts"

describe("embeddingToBlob / blobToEmbedding round-trip", () => {
  it("round-trips a 1536-dim embedding without data loss", () => {
    // Generate a fake 1536-dim embedding with varied values
    const original = Array.from({ length: 1536 }, (_, i) => (i % 13) / 13 - 0.5)
    const blob = embeddingToBlob(original)
    const restored = blobToEmbedding(blob)

    expect(restored).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      // Float32 precision loss is expected; tolerance of 1e-6 is fine
      expect(Math.abs(restored[i] - original[i])).toBeLessThan(1e-6)
    }
  })

  it("produces a Buffer of 4 * dim bytes", () => {
    const dim = 1536
    const embedding = new Array(dim).fill(0.1)
    const blob = embeddingToBlob(embedding)
    expect(blob.byteLength).toBe(dim * 4)
  })

  it("round-trips a minimal 4-dim embedding exactly", () => {
    const original = [1.0, -0.5, 0.25, 0.0]
    const restored = blobToEmbedding(embeddingToBlob(original))
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 6)
    }
  })

  it("handles zero vector without error", () => {
    const original = new Array(128).fill(0)
    const restored = blobToEmbedding(embeddingToBlob(original))
    expect(restored.every((v) => v === 0)).toBe(true)
  })

  it("handles negative values correctly", () => {
    const original = [-1.0, -0.5, -0.25, -0.125]
    const restored = blobToEmbedding(embeddingToBlob(original))
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 6)
    }
  })
})
