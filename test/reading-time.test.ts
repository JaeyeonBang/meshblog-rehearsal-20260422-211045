import { describe, it, expect } from "vitest"
import { estimateReadingMinutes } from "../src/lib/reading-time"

describe("estimateReadingMinutes", () => {
  it("returns 1 for empty string (minimum clamp)", () => {
    expect(estimateReadingMinutes("")).toBe(1)
  })

  it("returns 1 for whitespace-only string", () => {
    expect(estimateReadingMinutes("   \n\t  ")).toBe(1)
  })

  it("returns ~1–2 min for a 500-char Korean string", () => {
    // 500 Hangul chars / 400 chars-per-min = 1.25 → rounds to 1
    const ko = "안녕하세요".repeat(100) // 500 Hangul chars
    const result = estimateReadingMinutes(ko)
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(2)
  })

  it("returns at least 1 for a single English word", () => {
    expect(estimateReadingMinutes("hello")).toBe(1)
  })

  it("estimates ~2 min for a 500-word English passage", () => {
    // 500 words / 238 wpm ≈ 2.1 → rounds to 2
    const word = "word"
    const passage = (word + " ").repeat(500)
    const result = estimateReadingMinutes(passage)
    expect(result).toBe(2)
  })
})
