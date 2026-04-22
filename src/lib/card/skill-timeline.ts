/**
 * skill-timeline.ts — Monthly skill activity timeline.
 *
 * Porting changes from Volla:
 *   - user_id removed throughout (porting-rules: user_id removal)
 *   - $n → ? (porting-rules rule 1)
 *   - ANY($1) → IN (?,?,...) (porting-rules rule 7)
 *   - better-sqlite3 is sync: no await on db calls
 */
import { queryMany, type Database } from "../db/index.ts"

export type MonthlySkillData = {
  entityName: string
  months: { month: string; count: number }[]
}

export function getSkillTimeline(
  db: Database.Database,
  entityNames: string[],
  monthCount = 6
): MonthlySkillData[] {
  if (entityNames.length === 0) return []

  // Get entity IDs for the requested names
  const namePlaceholders = entityNames.map(() => "?").join(",")
  const entities = queryMany<{ id: number; name: string }>(
    db,
    `SELECT id, name FROM entities WHERE name IN (${namePlaceholders})`,
    entityNames
  )

  if (entities.length === 0) return []

  const entityIds = entities.map((e) => e.id)
  const entityIdPlaceholders = entityIds.map(() => "?").join(",")

  // Get note_entities with note creation dates
  const noteLinks = queryMany<{ entity_id: number; note_id: string }>(
    db,
    `SELECT entity_id, note_id FROM note_entities WHERE entity_id IN (${entityIdPlaceholders})`,
    entityIds
  )

  if (noteLinks.length === 0) return []

  const noteIds = [...new Set(noteLinks.map((l) => l.note_id))]
  const notePlaceholders = noteIds.map(() => "?").join(",")

  const notes = queryMany<{ id: string; created_at: string }>(
    db,
    `SELECT id, created_at FROM notes WHERE id IN (${notePlaceholders})`,
    noteIds
  )

  if (notes.length === 0) return []

  const noteCreatedMap = new Map(notes.map((n) => [n.id, n.created_at]))

  // Build entity → note_ids mapping
  const entityNoteIds = new Map<number, string[]>()
  for (const link of noteLinks) {
    const ids = entityNoteIds.get(link.entity_id) ?? []
    ids.push(link.note_id)
    entityNoteIds.set(link.entity_id, ids)
  }

  // Generate month labels for the past N months
  const monthLabels: string[] = []
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    monthLabels.push(d.toISOString().slice(0, 7))
  }

  // Count evidence per entity per month
  const result: MonthlySkillData[] = []

  for (const entity of entities) {
    const noteIdsForEntity = entityNoteIds.get(entity.id) ?? []
    const monthlyCounts = new Map<string, number>()

    for (const noteId of noteIdsForEntity) {
      const createdAt = noteCreatedMap.get(noteId)
      if (!createdAt) continue
      const month = new Date(createdAt).toISOString().slice(0, 7)
      monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1)
    }

    const months = monthLabels.map((m) => ({
      month: m,
      count: monthlyCounts.get(m) ?? 0,
    }))

    // Only include if at least 2 months have data
    const activeMonths = months.filter((m) => m.count > 0).length
    if (activeMonths >= 2) {
      result.push({ entityName: entity.name, months })
    }
  }

  return result
}
