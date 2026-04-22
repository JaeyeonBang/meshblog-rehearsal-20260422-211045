import { queryMany, type Database } from "../db/index.ts"
import { generateEmbedding, blobToEmbedding } from "./embed.ts"
import { topKByCosine } from "../llm/cosine.ts"
import { conceptSearch, type ConceptSearchResult } from "./concepts.ts"
import { getTemporalContext, type TemporalResult } from "./temporal.ts"
import { getEpisodicContext } from "./episodic.ts"

export type SearchResult = {
  id: string
  title: string
  content: string
  similarity: number
  tags: string[]
  source?: string
}

export type RetrievalDetails = {
  vector_results: string[]
  concept_results: string[]
  temporal_results: string[]
  episodic_boost: string[]
  entities_matched: string[]
}

/**
 * Semantic search via in-memory cosine similarity over note_embeddings BLOB.
 * Replaces pgvector match_notes() function (porting-rules rule 5 — JS cosine).
 */
export async function semanticSearch(
  db: Database.Database,
  query: string,
  limit = 5,
  threshold = 0.7
): Promise<SearchResult[]> {
  try {
    const queryEmbedding = await generateEmbedding(query)

    // Load all embeddings from DB — BLOB → Float32Array → number[]
    const rows = queryMany<{
      note_id: string
      embedding: Buffer
    }>(
      db,
      `SELECT note_id, embedding FROM note_embeddings`,
      []
    )

    const candidates = rows.map((row) => ({
      id: row.note_id,
      embedding: blobToEmbedding(row.embedding),
    }))

    const topK = topKByCosine(queryEmbedding, candidates, limit * 2)
    const above = topK.filter((r) => r.score >= threshold).slice(0, limit)

    if (above.length === 0) return []

    const noteIds = [...new Set(above.map((r) => r.id))]
    const notePlaceholders = noteIds.map(() => "?").join(",")

    const notes = queryMany<{
      id: string
      title: string
      content: string
      tags: string
    }>(
      db,
      `SELECT id, title, content, tags FROM notes WHERE id IN (${notePlaceholders})`,
      noteIds
    )

    const noteMap = new Map(notes.map((n) => [n.id, n]))

    const results: SearchResult[] = []
    for (const hit of above) {
      const note = noteMap.get(hit.id)
      if (!note) continue
      results.push({
        id: note.id,
        title: note.title,
        content: note.content,
        similarity: hit.score,
        tags: (() => {
          try { return JSON.parse(note.tags) as string[] } catch { return [] }
        })(),
        source: "vector",
      })
    }

    // Deduplicate by note id (multiple chunks per note), keep highest score
    const deduped = new Map<string, SearchResult>()
    for (const r of results) {
      const existing = deduped.get(r.id)
      if (!existing || r.similarity > existing.similarity) {
        deduped.set(r.id, r)
      }
    }

    return [...deduped.values()]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
  } catch (err) {
    console.error("Semantic search failed:", err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Hybrid search: vector + concept + temporal + episodic boost.
 * Graph search (from Volla) is omitted — meshblog uses note graph via export-graph, not runtime.
 * user_id removed throughout.
 */
export async function hybridSearch(
  db: Database.Database,
  query: string
): Promise<{ results: SearchResult[]; details: RetrievalDetails }> {
  const vectorResults = await semanticSearch(db, query, 3, 0.5)

  const tags = vectorResults.flatMap((r) => r.tags).filter(Boolean)
  const uniqueTags = [...new Set(tags)]

  // Simple entity extraction from query: lowercase words > 3 chars
  const queryEntities = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)

  const [conceptResults, temporalResults, episodicBoosts] = await Promise.all([
    Promise.resolve(conceptSearch(db, queryEntities, 3)),
    getTemporalContext(db, queryEntities, 3).catch(() => [] as TemporalResult[]),
    getEpisodicContext(db).catch(() => [] as { noteId: string; boost: number }[]),
  ])

  const episodicSet = new Map(episodicBoosts.map((e) => [e.noteId, e.boost]))

  // Merge results: dedup by noteId, keep highest score
  const merged = new Map<string, SearchResult>()

  for (const r of vectorResults) {
    const boost = episodicSet.get(r.id) ?? 0
    merged.set(r.id, { ...r, similarity: r.similarity + boost, source: "vector" })
  }

  for (const r of conceptResults) {
    const boost = episodicSet.get(r.id) ?? 0
    const score = r.score + boost
    const existing = merged.get(r.id)
    if (!existing || score > existing.similarity) {
      merged.set(r.id, {
        id: r.id, title: r.title, content: r.content,
        similarity: score, tags: r.tags, source: "concept",
      })
    }
  }

  for (const r of temporalResults) {
    const boost = episodicSet.get(r.id) ?? 0
    const score = r.score + boost
    const existing = merged.get(r.id)
    if (!existing || score > existing.similarity) {
      merged.set(r.id, {
        id: r.id, title: r.title, content: r.content,
        similarity: score, tags: r.tags, source: "temporal",
      })
    }
  }

  const results = [...merged.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)

  const details: RetrievalDetails = {
    vector_results: vectorResults.map((r) => r.id),
    concept_results: conceptResults.map((r) => r.id),
    temporal_results: temporalResults.map((r) => r.id),
    episodic_boost: [...episodicSet.keys()],
    entities_matched: queryEntities,
  }

  return { results, details }
}
