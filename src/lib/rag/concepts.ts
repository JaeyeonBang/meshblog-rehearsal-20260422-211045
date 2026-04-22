import { queryOne, queryMany, execute, type Database } from "../db/index.ts"
import { z } from "zod"
import { computeEntityCommunities } from "./graph-topology.ts"

// --- Schema validation ---

const conceptSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  entity_names: z.array(z.string()).min(2).max(10),
  confidence: z.number().min(0).max(1).default(0.5),
})

const contradictionSchema = z.object({
  claim_a: z.string(),
  claim_b: z.string(),
  note_ids: z.array(z.string()).min(2),
  entity_names: z.array(z.string()).default([]),
  severity: z.enum(["high", "medium", "low"]).default("medium"),
  explanation: z.string().default(""),
})

const contradictionResultSchema = z.object({
  contradictions: z.array(contradictionSchema).max(5).default([]),
})

export type ConceptResult = z.infer<typeof conceptSchema>
export type ContradictionResult = z.infer<typeof contradictionSchema>

// --- Community Naming ---
// NOTE: LLM calls (OpenRouter / Claude Code) are Agent C's domain.
// nameCommunity uses a simple heuristic fallback when no LLM is configured.

async function nameCommunity(
  memberNames: string[]
): Promise<{ name: string; description: string }> {
  // Cap at 20 members to avoid token limits
  const capped = memberNames.slice(0, 20)
  // Fallback: derive a concept name from most-common words in member names
  // (Phase 4 /ask will wire in Claude Code CLI here)
  const name = capped[0] ?? "Unknown"
  return {
    name: name.slice(0, 100),
    description: `Concept cluster: ${capped.slice(0, 5).join(", ")}`.slice(0, 500),
  }
}

// --- Concept Clustering ---

export async function clusterEntities(
  db: Database.Database,
  minEntities = 5
): Promise<{ concepts: ConceptResult[]; created: number; updated: number }> {
  // Step 1: Get all entities
  const entities = queryMany<{
    id: number
    name: string
    entity_type: string
    description: string
    mention_count: number
  }>(
    db,
    `SELECT id, name, entity_type, description, mention_count
     FROM entities
     ORDER BY mention_count DESC`,
    []
  )

  if (entities.length < minEntities) {
    return { concepts: [], created: 0, updated: 0 }
  }

  // Step 2: Compute Louvain community assignments
  // communityMap key is String(entity.id) for graphology node compatibility
  const communityMap = computeEntityCommunities(db)

  if (communityMap.size === 0) {
    return { concepts: [], created: 0, updated: 0 }
  }

  // Step 3: Group entities by community (only communities with 2+ members)
  const communityGroups = new Map<number, typeof entities>()
  for (const entity of entities) {
    const communityId = communityMap.get(String(entity.id))
    if (communityId === undefined) continue
    if (!communityGroups.has(communityId)) communityGroups.set(communityId, [])
    communityGroups.get(communityId)!.push(entity)
  }

  const validCommunities = Array.from(communityGroups.entries()).filter(
    ([, members]) => members.length >= 2
  )

  if (validCommunities.length === 0) {
    return { concepts: [], created: 0, updated: 0 }
  }

  // Step 4: Name each community (concurrency 5)
  const CONCURRENCY = 5
  const conceptResults: ConceptResult[] = []

  for (let i = 0; i < validCommunities.length; i += CONCURRENCY) {
    const batch = validCommunities.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async ([, members]) => {
        const memberNames = members.map((e) => e.name)
        const named = await nameCommunity(memberNames)
        return {
          name: named.name,
          description: named.description,
          entity_names: memberNames,
          confidence: 0.8,
        } as ConceptResult
      })
    )
    for (const r of results) {
      if (r.status === "fulfilled") conceptResults.push(r.value)
      else console.warn("[concepts] nameCommunity failed for community:", r.reason)
    }
  }

  // Step 5: Clear stale concepts AFTER all LLM names are ready (crash-safe)
  execute(db, `DELETE FROM concepts`, [])

  let created = 0
  let updated = 0

  for (const concept of conceptResults) {
    const normalizedName = concept.name.toLowerCase().trim()

    // UPSERT concept
    const existing = queryOne<{ id: string; confidence: number }>(
      db,
      `SELECT id, confidence FROM concepts WHERE name = ?`,
      [normalizedName]
    )

    let conceptId: string

    if (existing) {
      if (concept.confidence >= existing.confidence) {
        execute(
          db,
          `UPDATE concepts
           SET description = ?, confidence = ?, last_updated_at = datetime('now')
           WHERE id = ?`,
          [concept.description, concept.confidence, existing.id]
        )
      }
      conceptId = existing.id
      updated++
    } else {
      conceptId = crypto.randomUUID()
      execute(
        db,
        `INSERT INTO concepts (id, name, description, confidence)
         VALUES (?, ?, ?, ?)`,
        [conceptId, normalizedName, concept.description, concept.confidence]
      )
      created++
    }

    // Link entities to concept
    // CRITICAL (porting-rules rule 8): entity_id is INTEGER (not TEXT)
    for (const entityName of concept.entity_names) {
      const entity = queryOne<{ id: number }>(
        db,
        `SELECT id FROM entities WHERE name = ?`,
        [entityName.toLowerCase().trim()]
      )

      if (entity) {
        execute(
          db,
          `INSERT INTO concept_entities (concept_id, entity_id)
           VALUES (?, ?)
           ON CONFLICT (concept_id, entity_id) DO NOTHING`,
          [conceptId, entity.id]   // entity.id is INTEGER — matches schema
        )
      }
    }
  }

  return { concepts: conceptResults, created, updated }
}

/**
 * Alternative entry point used by scripts/build-index.ts.
 * Accepts a pre-computed communityMap (string entityId → communityId)
 * so the caller can reuse a single computeEntityCommunities() call.
 */
export async function buildConceptsFromCommunities(
  db: Database.Database,
  communityMap: Map<string, number>
): Promise<{ concepts: ConceptResult[]; created: number; updated: number }> {
  // Get all entities so we can resolve names from the community map
  const entities = queryMany<{
    id: number
    name: string
    entity_type: string
    description: string
    mention_count: number
  }>(
    db,
    `SELECT id, name, entity_type, description, mention_count
     FROM entities
     ORDER BY mention_count DESC`,
    []
  )

  if (communityMap.size === 0 || entities.length === 0) {
    return { concepts: [], created: 0, updated: 0 }
  }

  // Group entities by community (only communities with 2+ members)
  const communityGroups = new Map<number, typeof entities>()
  for (const entity of entities) {
    const communityId = communityMap.get(String(entity.id))
    if (communityId === undefined) continue
    if (!communityGroups.has(communityId)) communityGroups.set(communityId, [])
    communityGroups.get(communityId)!.push(entity)
  }

  const validCommunities = Array.from(communityGroups.entries()).filter(
    ([, members]) => members.length >= 2
  )

  if (validCommunities.length === 0) {
    return { concepts: [], created: 0, updated: 0 }
  }

  // Name communities and persist
  const CONCURRENCY = 5
  const conceptResults: ConceptResult[] = []

  for (let i = 0; i < validCommunities.length; i += CONCURRENCY) {
    const batch = validCommunities.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async ([, members]) => {
        const memberNames = members.map((e) => e.name)
        const named = await nameCommunity(memberNames)
        return {
          name: named.name,
          description: named.description,
          entity_names: memberNames,
          confidence: 0.8,
        } as ConceptResult
      })
    )
    for (const r of results) {
      if (r.status === "fulfilled") conceptResults.push(r.value)
      else console.warn("[concepts] nameCommunity failed:", r.reason)
    }
  }

  // Clear stale concepts and persist
  execute(db, `DELETE FROM concepts`, [])

  let created = 0
  let updated = 0

  for (const concept of conceptResults) {
    const normalizedName = concept.name.toLowerCase().trim()

    const existing = queryOne<{ id: string; confidence: number }>(
      db,
      `SELECT id, confidence FROM concepts WHERE name = ?`,
      [normalizedName]
    )

    let conceptId: string

    if (existing) {
      if (concept.confidence >= existing.confidence) {
        execute(
          db,
          `UPDATE concepts
           SET description = ?, confidence = ?, last_updated_at = datetime('now')
           WHERE id = ?`,
          [concept.description, concept.confidence, existing.id]
        )
      }
      conceptId = existing.id
      updated++
    } else {
      conceptId = crypto.randomUUID()
      execute(
        db,
        `INSERT INTO concepts (id, name, description, confidence)
         VALUES (?, ?, ?, ?)`,
        [conceptId, normalizedName, concept.description, concept.confidence]
      )
      created++
    }

    // Link entities to concept — entity_id is INTEGER (porting-rules rule 8)
    for (const entityName of concept.entity_names) {
      const entity = queryOne<{ id: number }>(
        db,
        `SELECT id FROM entities WHERE name = ?`,
        [entityName.toLowerCase().trim()]
      )
      if (entity) {
        execute(
          db,
          `INSERT INTO concept_entities (concept_id, entity_id)
           VALUES (?, ?)
           ON CONFLICT (concept_id, entity_id) DO NOTHING`,
          [conceptId, entity.id]
        )
      }
    }
  }

  return { concepts: conceptResults, created, updated }
}

// --- Concept Search ---

export type ConceptSearchResult = {
  id: string
  title: string
  content: string
  score: number
  tags: string[]
  source: "concept"
}

/**
 * Concept search: entity names → concept membership → sibling entities → notes.
 * Ported from Volla single-CTE approach; split into sequential queries (porting-rules rule 9).
 * ANY($n::text[]) → IN (?,?,...) dynamic placeholder (porting-rules rule 7).
 * user_id removed throughout (porting-rules rule: user_id removal).
 */
export function conceptSearch(
  db: Database.Database,
  entityNames: string[],
  limit = 5,
  entityIds?: number[]
): ConceptSearchResult[] {
  const normalizedNames = entityNames.map((n) => n.toLowerCase().trim()).filter(Boolean)
  const hasEntityIds = entityIds && entityIds.length > 0

  if (normalizedNames.length === 0 && !hasEntityIds) return []

  // Resolve matching entity IDs by name
  let matchedEntityIds: number[] = []

  if (normalizedNames.length > 0) {
    const namePlaceholders = normalizedNames.map(() => "?").join(",")
    const nameMatches = queryMany<{ id: number }>(
      db,
      `SELECT id FROM entities WHERE name IN (${namePlaceholders})`,
      normalizedNames
    )
    matchedEntityIds = nameMatches.map((e) => e.id)
  }

  if (hasEntityIds) {
    matchedEntityIds = [...new Set([...matchedEntityIds, ...entityIds!])]
  }

  if (matchedEntityIds.length === 0) return []

  // Find related concept IDs
  const entityPlaceholders = matchedEntityIds.map(() => "?").join(",")
  const relatedConcepts = queryMany<{ concept_id: string }>(
    db,
    `SELECT DISTINCT concept_id FROM concept_entities WHERE entity_id IN (${entityPlaceholders})`,
    matchedEntityIds
  )
  if (relatedConcepts.length === 0) return []

  const conceptIds = relatedConcepts.map((c) => c.concept_id)

  // Find sibling entities (in same concepts, excluding matched)
  const conceptPlaceholders = conceptIds.map(() => "?").join(",")
  const excludePlaceholders = matchedEntityIds.map(() => "?").join(",")
  const siblings = queryMany<{ entity_id: number }>(
    db,
    `SELECT DISTINCT ce.entity_id
     FROM concept_entities ce
     WHERE ce.concept_id IN (${conceptPlaceholders})
       AND ce.entity_id NOT IN (${excludePlaceholders})`,
    [...conceptIds, ...matchedEntityIds]
  )
  if (siblings.length === 0) return []

  const siblingIds = siblings.map((s) => s.entity_id)
  const siblingPlaceholders = siblingIds.map(() => "?").join(",")

  // Find notes via sibling entities
  const rows = queryMany<{ id: string; title: string; content: string; tags: string }>(
    db,
    `SELECT DISTINCT n.id, n.title, n.content, n.tags
     FROM notes n
     JOIN note_entities ne ON ne.note_id = n.id
     WHERE ne.entity_id IN (${siblingPlaceholders})
     LIMIT ?`,
    [...siblingIds, limit]
  )

  return rows.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    // tags stored as JSON string in SQLite (porting-rules rule 4)
    tags: (() => {
      try { return JSON.parse(note.tags) as string[] } catch { return [] }
    })(),
    score: 0.7,
    source: "concept" as const,
  }))
}

// --- Contradiction Detection ---
// NOTE: LLM dependency (callOpenRouter) removed per porting-rules PGR-3.
// detectContradictions is preserved structurally for Phase 4 wiring.
// The buildContradictionPrompt import is deferred — mark with TODO.

export async function detectContradictions(
  db: Database.Database,
  conceptId?: string
): Promise<ContradictionResult[]> {
  let noteIds: string[]

  if (conceptId) {
    const entityIds = queryMany<{ entity_id: number }>(
      db,
      `SELECT entity_id FROM concept_entities WHERE concept_id = ?`,
      [conceptId]
    )

    if (entityIds.length === 0) return []

    const eIdPlaceholders = entityIds.map(() => "?").join(",")
    const noteEntities = queryMany<{ note_id: string }>(
      db,
      `SELECT DISTINCT note_id FROM note_entities
       WHERE entity_id IN (${eIdPlaceholders})`,
      entityIds.map((e) => e.entity_id)
    )

    noteIds = noteEntities.map((ne) => ne.note_id)
  } else {
    const overlapping = queryMany<{ note_id: string }>(
      db,
      `SELECT ne.note_id
       FROM note_entities ne
       JOIN entities e ON ne.entity_id = e.id
       GROUP BY ne.note_id
       HAVING COUNT(DISTINCT ne.entity_id) >= 2
       ORDER BY COUNT(DISTINCT ne.entity_id) DESC
       LIMIT 20`,
      []
    )
    noteIds = overlapping.map((o) => o.note_id)
  }

  if (noteIds.length < 2) return []

  const notePlaceholders = noteIds.map(() => "?").join(",")
  const notes = queryMany<{ id: string; title: string; content: string }>(
    db,
    `SELECT id, title, content FROM notes
     WHERE id IN (${notePlaceholders})
     ORDER BY updated_at DESC
     LIMIT 10`,
    noteIds
  )

  if (notes.length < 2) return []

  // TODO(Phase 4): wire in Claude Code CLI for contradiction detection
  // const messages = buildContradictionPrompt(notes)
  // const response = await callClaudeCode({ messages, ... })
  console.info("[concepts] detectContradictions: LLM not wired in Phase 2 (Phase 4 task)")
  return []
}
