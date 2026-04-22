import { queryMany, execute, type Database } from "../db/index.ts"

type Entity = {
  id: number
  name: string
  entity_type: string
  mention_count: number
  description: string
}

type MergeCandidate = {
  canonical: string
  canonical_type: string
  duplicates: string[]
  reason: string
}

/**
 * Use LLM to identify entities that should be merged.
 * Groups semantically equivalent entities (e.g. "react" and "react.js").
 *
 * NOTE: LLM call (callOpenRouter) removed per porting-rules PGR-3.
 * Returns heuristic same-name candidates only in Phase 2.
 * Phase 4: wire in Claude Code CLI for semantic merge suggestions.
 *
 * user_id removed throughout (porting-rules rule: user_id removal).
 * ANY($n::text[]) → IN (?,?,...) (porting-rules rule 7).
 */
export function findMergeCandidates(
  db: Database.Database
): MergeCandidate[] {
  const entities = queryMany<Entity>(
    db,
    `SELECT id, name, entity_type, mention_count, description
     FROM entities
     ORDER BY mention_count DESC`,
    []
  )

  if (entities.length < 2) return []

  // Group by name to find same-name different-type duplicates
  const byName = new Map<string, Entity[]>()
  for (const e of entities) {
    const group = byName.get(e.name) ?? []
    group.push(e)
    byName.set(e.name, group)
  }

  // Only return exact-name duplicates (no LLM in Phase 2)
  // TODO(Phase 4): add semantic fuzzy-match via Claude Code CLI
  const candidates: MergeCandidate[] = []
  for (const [name, group] of byName.entries()) {
    if (group.length <= 1) continue
    // Pick highest mention_count as canonical
    const sorted = [...group].sort((a, b) => b.mention_count - a.mention_count)
    const canonical = sorted[0]
    const duplicates = sorted.slice(1).map((e) => e.name)
    candidates.push({
      canonical: canonical.name,
      canonical_type: canonical.entity_type,
      duplicates,
      reason: `Same name "${name}" with ${group.length} entity_type variants`,
    })
  }

  return candidates
}

/**
 * Merge duplicate entities into their canonical form.
 * Updates note_entities and entity_relationships references, then deletes duplicates.
 * user_id removed.
 * ANY($n) → IN (?,?,...) (porting-rules rule 7).
 */
export function mergeEntities(
  db: Database.Database,
  candidates: MergeCandidate[]
): { merged: number; deleted: number } {
  let merged = 0
  let deleted = 0

  for (const candidate of candidates) {
    // Find the canonical entity
    const canonicalEntities = queryMany<{
      id: number
      name: string
      entity_type: string
      mention_count: number
    }>(
      db,
      `SELECT id, name, entity_type, mention_count
       FROM entities
       WHERE name = ?`,
      [candidate.canonical]
    )

    if (candidate.duplicates.length === 0) continue

    const dupePlaceholders = candidate.duplicates.map(() => "?").join(",")

    // Find all duplicate entities
    const dupeEntities = queryMany<{
      id: number
      name: string
      entity_type: string
      mention_count: number
    }>(
      db,
      `SELECT id, name, entity_type, mention_count
       FROM entities
       WHERE name IN (${dupePlaceholders})`,
      candidate.duplicates
    )

    if (!canonicalEntities.length || !dupeEntities.length) continue

    // Pick highest mention_count as canonical
    const allEntities = [...canonicalEntities, ...dupeEntities]
    allEntities.sort((a, b) => b.mention_count - a.mention_count)
    const canonical = allEntities[0]
    const toDelete = allEntities.slice(1)

    if (toDelete.length === 0) continue

    const totalMentions = allEntities.reduce((sum, e) => sum + e.mention_count, 0)

    db.transaction(() => {
      // Update canonical entity type if specified
      if (candidate.canonical_type && canonical.entity_type !== candidate.canonical_type) {
        execute(
          db,
          `UPDATE entities SET entity_type = ?, mention_count = ? WHERE id = ?`,
          [candidate.canonical_type, totalMentions, canonical.id]
        )
      } else {
        execute(
          db,
          `UPDATE entities SET mention_count = ? WHERE id = ?`,
          [totalMentions, canonical.id]
        )
      }

      for (const dupe of toDelete) {
        // Re-point note_entities from dupe → canonical
        const noteLinks = queryMany<{ note_id: string }>(
          db,
          `SELECT note_id FROM note_entities WHERE entity_id = ?`,
          [dupe.id]
        )

        for (const link of noteLinks) {
          execute(
            db,
            `INSERT INTO note_entities (note_id, entity_id)
             VALUES (?, ?)
             ON CONFLICT (note_id, entity_id) DO NOTHING`,
            [link.note_id, canonical.id]
          )
        }

        // Re-point entity_relationships from dupe → canonical
        execute(
          db,
          `UPDATE entity_relationships SET source_entity_id = ? WHERE source_entity_id = ?`,
          [canonical.id, dupe.id]
        )

        execute(
          db,
          `UPDATE entity_relationships SET target_entity_id = ? WHERE target_entity_id = ?`,
          [canonical.id, dupe.id]
        )

        // Delete the duplicate entity (CASCADE handles remaining note_entities)
        execute(db, `DELETE FROM entities WHERE id = ?`, [dupe.id])
        deleted++
      }
    })()

    merged++
  }

  return { merged, deleted }
}
