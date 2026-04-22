import type { ChatMessage } from "../openrouter"

const ENTITY_TYPES = ["person", "technology", "project", "concept", "organization", "other"] as const

const SYSTEM_PROMPT = `You are an entity extraction system. Extract entities and relationships from the given note content.

Return a JSON object with this exact structure:
{
  "entities": [
    { "name": "Entity Name", "type": "technology", "description": "Brief description" }
  ],
  "relationships": [
    { "source": "Entity A", "target": "Entity B", "relationship": "used_in" }
  ]
}

Rules:
- Entity types must be one of: ${ENTITY_TYPES.join(", ")}
- Use canonical names (e.g., "Next.js" not "nextjs", "React" not "react.js")
- Only extract entities that are explicitly mentioned in the text
- Keep descriptions under 50 characters
- Relationships should describe how entities relate (e.g., "used_in", "created_by", "part_of", "related_to")
- Return at most 10 entities and 10 relationships
- If the note has no extractable entities, return {"entities": [], "relationships": []}
- Return ONLY the JSON object, no markdown or explanation`

export function buildEntityExtractionPrompt(noteContent: string): ChatMessage[] {
  const cleaned = noteContent
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: cleaned || "Empty note" },
  ]
}

export { ENTITY_TYPES }
