import { queryOne, queryMany, execute, type Database } from "../db/index.ts"
import { generateEmbedding, embeddingToBlob, blobToEmbedding } from "./embed.ts"
import { topKByCosine } from "../llm/cosine.ts"
import type { LayerHit } from "./layered-search.ts"

// --- Wiki Synthesis ---

/**
 * Synthesize a wiki article for a single entity.
 *
 * wiki synthesis pipeline (per entity):
 * ─────────────────────────────────────
 * entity (wiki_needs_regen=true)
 *   │
 *   ├─ is_manual_edit? ──yes──> SKIP
 *   ├─ SELECT notes via note_entities
 *   │   └── 0 notes? ──> SKIP
 *   ├─ SELECT peer entity names (for [[links]])
 *   ├─ SELECT relationships (confidence > 0.5)
 *   ├─ LLM synthesis → markdown   [TODO Phase 4: wire Claude Code CLI]
 *   │   └── parse failure? ──> LOG + SKIP
 *   ├─ generateEmbedding(content)
 *   │   └── API failure? ──> INSERT without embedding
 *   ├─ BEGIN (version bump transaction)
 *   │   ├─ UPDATE is_current=false (old version)
 *   │   └─ INSERT (version++, is_current=true)
 *   │ COMMIT
 *   └─ SET wiki_needs_regen=false
 *
 * user_id removed throughout (porting-rules rule: user_id removal).
 * $n → ? (porting-rules rule 1).
 * NOW() → datetime('now') (porting-rules rule 3).
 * vector <=> → JS cosine (porting-rules rule 5). // TODO: replaced by JS cosine
 * text[] → JSON (porting-rules rule 4): source_note_ids stored as JSON string.
 * entity_id FK verified: entities.id is INTEGER (porting-rules rule 8).
 */
export async function synthesizeWikiArticle(
  db: Database.Database,
  entityId: number
): Promise<{ synthesized: boolean; reason?: string }> {
  // 1. Check for manual edit
  const existingArticle = queryOne<{ is_manual_edit: number; version: number }>(
    db,
    `SELECT is_manual_edit, version FROM wiki_articles
     WHERE entity_id = ? AND is_current = 1`,
    [entityId]
  )

  if (existingArticle?.is_manual_edit) {
    return { synthesized: false, reason: "manual_edit" }
  }

  // 2. Get entity info (entity_id is INTEGER)
  const entity = queryOne<{
    id: number
    name: string
    entity_type: string
    description: string
  }>(
    db,
    `SELECT id, name, entity_type, description FROM entities WHERE id = ?`,
    [entityId]
  )

  if (!entity) {
    return { synthesized: false, reason: "entity_not_found" }
  }

  // 3. Get notes mentioning this entity
  const notes = queryMany<{ id: string; title: string; content: string }>(
    db,
    `SELECT n.id, n.title, n.content
     FROM notes n
     JOIN note_entities ne ON ne.note_id = n.id
     WHERE ne.entity_id = ?
     ORDER BY n.updated_at DESC
     LIMIT 20`,
    [entityId]
  )

  if (notes.length === 0) {
    return { synthesized: false, reason: "no_notes" }
  }

  // 4. Get peer entity names for [[links]]
  const peers = queryMany<{ name: string }>(
    db,
    `SELECT DISTINCT e.name
     FROM entities e
     WHERE e.id != ?
       AND e.mention_count >= 2
     ORDER BY e.mention_count DESC
     LIMIT 100`,
    [entityId]
  )
  const peerNames = peers.map((p) => p.name)

  // 5. Get relationships with confidence > 0.5
  const relationships = queryMany<{
    target_name: string
    relationship: string
    confidence: number
  }>(
    db,
    `SELECT e.name AS target_name, er.relationship, er.confidence
     FROM entity_relationships er
     JOIN entities e ON e.id = er.target_entity_id
     WHERE er.source_entity_id = ? AND er.confidence > 0.5
     UNION
     SELECT e.name AS target_name, er.relationship, er.confidence
     FROM entity_relationships er
     JOIN entities e ON e.id = er.source_entity_id
     WHERE er.target_entity_id = ? AND er.confidence > 0.5`,
    [entityId, entityId]
  )

  // 6. LLM synthesis — TODO(Phase 4): wire in Claude Code CLI
  // For Phase 2, generate a placeholder article from available data
  const relContext = relationships
    .map((r) => `- ${r.relationship}: [[${r.target_name}]] (confidence: ${r.confidence.toFixed(1)})`)
    .join("\n")

  const noteContext = notes
    .map((n) => `## ${n.title}\n${n.content.slice(0, 500)}`)
    .join("\n\n---\n\n")

  // Stub synthesis: markdown summary from notes
  // TODO(Phase 4): replace with Claude Code CLI call
  const content = `# ${entity.name}

**Type:** ${entity.entity_type}
${entity.description ? `\n${entity.description}\n` : ""}
## Known Relationships
${relContext || "None documented yet."}

## Source Notes
${notes.slice(0, 3).map((n) => `- ${n.title}`).join("\n")}

*Allowed cross-links: ${peerNames.slice(0, 10).join(", ")}*

---
*This article was auto-generated from ${notes.length} notes. LLM synthesis pending Phase 4.*
`

  // 7. Generate embedding (tolerate failure)
  let embeddingBlob: Buffer | null = null
  try {
    const embedding = await generateEmbedding(content)
    embeddingBlob = embeddingToBlob(embedding)
  } catch (err) {
    console.warn("[wiki] embedding failed, inserting without embedding:", err instanceof Error ? err.message : err)
  }

  // 8. source_note_ids stored as JSON string (porting-rules rule 4: text[] → JSON)
  const sourceNoteIdsJson = JSON.stringify(notes.map((n) => n.id))

  // 9. Version bump in transaction
  const newVersion = (existingArticle?.version ?? 0) + 1

  try {
    db.transaction(() => {
      // Mark old version as not current
      execute(
        db,
        `UPDATE wiki_articles SET is_current = 0
         WHERE entity_id = ? AND is_current = 1`,
        [entityId]
      )

      const newId = crypto.randomUUID()
      if (embeddingBlob) {
        execute(
          db,
          `INSERT INTO wiki_articles
             (id, entity_id, content, content_embedding, source_note_ids, version, is_current)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [newId, entityId, content, embeddingBlob, sourceNoteIdsJson, newVersion]
        )
      } else {
        execute(
          db,
          `INSERT INTO wiki_articles
             (id, entity_id, content, source_note_ids, version, is_current)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [newId, entityId, content, sourceNoteIdsJson, newVersion]
        )
      }

      // Clear dirty flag
      execute(
        db,
        `UPDATE entities SET wiki_needs_regen = 0 WHERE id = ?`,
        [entityId]
      )
    })()
  } catch (err) {
    console.error("[wiki] article insert failed:", err)
    return { synthesized: false, reason: "db_error" }
  }

  return { synthesized: true }
}

// --- Wiki Search (L4) ---

/**
 * Search wiki articles by vector similarity.
 * Generates embedding from query internally.
 * embedding <=> vector → JS cosine (porting-rules rule 5). // TODO: replaced by JS cosine
 * user_id removed.
 */
export async function searchWikiLayer(
  db: Database.Database,
  query: string,
  limit: number,
  threshold = 0.5
): Promise<LayerHit[]> {
  try {
    const embedding = await generateEmbedding(query)

    // Load all wiki articles with embeddings (BLOB → number[])
    const rows = queryMany<{
      id: string
      entity_name: string
      content: string
      content_embedding: Buffer | null
    }>(
      db,
      `SELECT wa.id, e.name AS entity_name, wa.content, wa.content_embedding
       FROM wiki_articles wa
       JOIN entities e ON e.id = wa.entity_id
       WHERE wa.is_current = 1
         AND wa.content_embedding IS NOT NULL`,
      []
    )

    // Keep a lookup map for entity_name and content (topKByCosine only returns id+embedding+score)
    const metaMap = new Map(
      rows
        .filter((r) => r.content_embedding !== null)
        .map((r) => [r.id, { entity_name: r.entity_name, content: r.content }])
    )

    const candidates = rows
      .filter((r) => r.content_embedding !== null)
      .map((r) => ({
        id: r.id,
        embedding: blobToEmbedding(r.content_embedding!),
      }))

    const topK = topKByCosine(embedding, candidates, limit * 2)
    const above = topK.filter((r) => r.score >= threshold).slice(0, limit)

    return above.map((r) => {
      const meta = metaMap.get(r.id) ?? { entity_name: "Unknown", content: "" }
      return {
        id: r.id,
        title: `Wiki: ${meta.entity_name}`,
        content: meta.content,
        tags: [],
        score: r.score,
        layer: "wiki" as const,
        source: "wiki_vector",
      }
    })
  } catch (err) {
    console.error("[wiki] wiki layer search failed:", err)
    return []
  }
}
