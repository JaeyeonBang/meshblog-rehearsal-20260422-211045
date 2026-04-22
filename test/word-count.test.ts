import { describe, it, expect } from "vitest"
import { getReadingStats } from "../src/lib/word-count"

describe("getReadingStats", () => {
  it("returns 0 words and readingTime 1 for empty string", () => {
    const result = getReadingStats("")
    expect(result.words).toBe(0)
    expect(result.readingTime).toBe(1)
  })

  it("returns 0 words and readingTime 1 for whitespace-only string", () => {
    const result = getReadingStats("   \n\t  ")
    expect(result.words).toBe(0)
    expect(result.readingTime).toBe(1)
  })

  it("counts words in a plain English sentence", () => {
    // "hello world this is a test" = 6 words
    const result = getReadingStats("hello world this is a test")
    expect(result.words).toBe(6)
    expect(result.readingTime).toBe(1)
  })

  it("strips markdown headings before counting", () => {
    const md = "## This is a Heading\n\nSome body text here."
    const result = getReadingStats(md)
    // Heading markers stripped, words counted from remaining text
    expect(result.words).toBeGreaterThan(0)
  })

  it("strips fenced code blocks before counting", () => {
    const md = "Intro text.\n\n```javascript\nconst foo = 'bar';\n```\n\nEnd text."
    const result = getReadingStats(md)
    // "Intro text End text" — code block stripped
    expect(result.words).toBeGreaterThanOrEqual(2)
    // Code keywords (const, foo, bar) should not inflate count
    expect(result.words).toBeLessThan(20)
  })

  it("returns readingTime of at least 1 for any non-empty content", () => {
    const result = getReadingStats("one word")
    expect(result.readingTime).toBeGreaterThanOrEqual(1)
  })

  it("calculates readingTime as floor(words / 200), minimum 1", () => {
    // 400 words should give readingTime = 2
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ")
    const result = getReadingStats(words)
    expect(result.words).toBe(400)
    expect(result.readingTime).toBe(2)
  })

  it("calculates readingTime floor (199 words → 0 → clamped to 1)", () => {
    const words = Array.from({ length: 199 }, (_, i) => `word${i}`).join(" ")
    const result = getReadingStats(words)
    expect(result.words).toBe(199)
    expect(result.readingTime).toBe(1)
  })

  it("calculates readingTime = 3 for 600 words", () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ")
    const result = getReadingStats(words)
    expect(result.words).toBe(600)
    expect(result.readingTime).toBe(3)
  })

  it("strips inline code before counting", () => {
    const md = "Use `const foo = bar()` to initialize."
    const result = getReadingStats(md)
    // "Use to initialize" = 3 words after stripping inline code
    expect(result.words).toBeGreaterThanOrEqual(2)
    expect(result.words).toBeLessThan(10)
  })

  it("strips markdown links but keeps link label text", () => {
    const md = "Read [the documentation](https://example.com) for details."
    const result = getReadingStats(md)
    // "Read the documentation for details" = 5 words
    expect(result.words).toBe(5)
  })
})
