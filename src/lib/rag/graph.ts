import { z } from "zod"
import { queryOne, execute, type Database } from "../db/index.ts"
import { callOpenRouter } from "../llm/openrouter.ts"
import { buildEntityExtractionPrompt, ENTITY_TYPES } from "../llm/prompts/entity-extract.ts"

const entitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(ENTITY_TYPES).catch("other"),
  description: z.string().default(""),
})

export const extractionResultSchema = z.object({
  entities: z.array(entitySchema).max(10).default([]),
  relationships: z.array(z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    relationship: z.string().min(1),
  })).max(10).default([]),
})

export type ExtractionResult = z.infer<typeof extractionResultSchema>

const CANONICAL_ALIASES: Record<string, string> = {
  "react.js": "react", "reactjs": "react", "react js": "react",
  "next.js": "nextjs", "next js": "nextjs",
  "node.js": "nodejs", "node js": "nodejs",
  "vue.js": "vue", "vuejs": "vue",
  "nuxt.js": "nuxt", "express.js": "express", "expressjs": "express",
  "nest.js": "nestjs", "svelte.js": "svelte",
  "mongo db": "mongodb", "mongo": "mongodb",
  "pg": "postgresql", "postgres": "postgresql",
  "ts": "typescript", "js": "javascript",
  "py": "python", "python3": "python",
  "golang": "go",
  "tailwind css": "tailwindcss", "tailwind": "tailwindcss",
  "gpt4": "gpt-4", "gpt4o": "gpt-4o", "gpt-4o mini": "gpt-4o-mini", "gpt4o-mini": "gpt-4o-mini",
  "rest api": "rest", "restful api": "rest", "graphql api": "graphql",
  "github actions": "github-actions", "gh actions": "github-actions",
}

export function normalizeName(name: string): string {
  const cleaned = name.replace(/<[^>]*>/g, "").trim().toLowerCase()
  return CANONICAL_ALIASES[cleaned] ?? cleaned
}

export function sanitizeText(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim().slice(0, 200)
}

export async function extractEntities(
  db: Database.Database,
  noteId: string,
  noteContent: string,
  maxRetries = 2,
): Promise<ExtractionResult> {
  execute(db, "UPDATE notes SET graph_status = 'pending' WHERE id = ?", [noteId])

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }

      const messages = buildEntityExtractionPrompt(noteContent)
      const response = await callOpenRouter({
        messages,
        model: "openai/gpt-4o-mini",
        maxTokens: 1500,
        temperature: 0.3,
      })

      const json = await response.json()
      const content = json.choices?.[0]?.message?.content ?? ""

      const jsonStr = content.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "").trim()
      const parsed = JSON.parse(jsonStr)
      const result = extractionResultSchema.parse(parsed)

      const normalizedEntities = result.entities.map((e) => ({
        ...e,
        name: normalizeName(e.name),
        description: sanitizeText(e.description),
      })).filter((e) => e.name.length > 0)

      const normalizedRelationships = result.relationships.map((r) => ({
        source: normalizeName(r.source),
        target: normalizeName(r.target),
        relationship: sanitizeText(r.relationship),
      }))

      for (const entity of normalizedEntities) {
        const existing = queryOne<{ id: number; mention_count: number }>(
          db,
          "SELECT id, mention_count FROM entities WHERE name = ? AND entity_type = ?",
          [entity.name, entity.type],
        )

        let entityId: number

        if (existing) {
          execute(
            db,
            "UPDATE entities SET description = COALESCE(NULLIF(?, ''), description), last_seen_at = datetime('now'), mention_count = ? WHERE id = ?",
            [entity.description, existing.mention_count + 1, existing.id],
          )
          entityId = existing.id
        } else {
          const res = execute(
            db,
            "INSERT INTO entities (name, entity_type, description) VALUES (?, ?, ?)",
            [entity.name, entity.type, entity.description],
          )
          entityId = Number(res.lastInsertRowid)
        }

        execute(
          db,
          "INSERT OR IGNORE INTO note_entities (note_id, entity_id) VALUES (?, ?)",
          [noteId, entityId],
        )
      }

      for (const rel of normalizedRelationships) {
        const sourceEntity = queryOne<{ id: number }>(
          db,
          "SELECT id FROM entities WHERE name = ?",
          [rel.source],
        )
        const targetEntity = queryOne<{ id: number }>(
          db,
          "SELECT id FROM entities WHERE name = ?",
          [rel.target],
        )

        if (sourceEntity && targetEntity) {
          execute(
            db,
            `INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship, confidence, source_type)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (source_entity_id, target_entity_id, relationship)
             DO UPDATE SET confidence = MAX(entity_relationships.confidence, excluded.confidence),
                           source_type = CASE WHEN excluded.confidence > entity_relationships.confidence
                                              THEN excluded.source_type
                                              ELSE entity_relationships.source_type END`,
            [sourceEntity.id, targetEntity.id, rel.relationship, 0.7, "INFERRED"],
          )
        }
      }

      execute(db, "UPDATE notes SET graph_status = 'done' WHERE id = ?", [noteId])

      return { entities: normalizedEntities, relationships: normalizedRelationships }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[graph] attempt ${attempt + 1} failed:`, lastError.message)
    }
  }

  execute(db, "UPDATE notes SET graph_status = 'failed' WHERE id = ?", [noteId])
  console.error("[graph] entity extraction failed after retries:", lastError?.message)
  return { entities: [], relationships: [] }
}
