import { describe, it, expect } from "vitest"
import { extractionResultSchema } from "../graph.ts"

describe("extractionResultSchema (Zod robustness)", () => {
  it("parses valid LLM output", () => {
    const data = {
      entities: [{ name: "React", type: "technology", description: "UI lib" }],
      relationships: [{ source: "React", target: "JS", relationship: "uses" }],
    }
    const parsed = extractionResultSchema.parse(data)
    expect(parsed.entities).toHaveLength(1)
    expect(parsed.relationships).toHaveLength(1)
  })

  it("defaults missing arrays to []", () => {
    const parsed = extractionResultSchema.parse({})
    expect(parsed.entities).toEqual([])
    expect(parsed.relationships).toEqual([])
  })

  it("coerces unknown entity type to 'other'", () => {
    const parsed = extractionResultSchema.parse({
      entities: [{ name: "X", type: "unknown_type", description: "" }],
    })
    expect(parsed.entities[0].type).toBe("other")
  })

  it("rejects malformed entities (missing name)", () => {
    expect(() =>
      extractionResultSchema.parse({
        entities: [{ type: "technology", description: "" }],
      })
    ).toThrow()
  })
})
