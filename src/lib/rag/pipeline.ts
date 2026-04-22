/**
 * pipeline.ts — Full RAG pipeline (cache → pinned Q&A → hybrid search).
 *
 * RESERVE (미사용 / 예비): meshblog is pre-gen → no runtime chatbot in Phase 2.
 * Port is mechanical per plan Task 7 / Patch A5.
 * Phase 4 /ask endpoint will activate this.
 *
 * Porting changes from Volla:
 *   - user_id removed throughout (porting-rules: user_id removal)
 *   - $n → ? (porting-rules rule 1)
 *   - pinned_qa table may not exist in Phase 2 DB — graceful fallback
 */
import { queryMany, type Database } from "../db/index.ts"
import { hybridSearch, type SearchResult, type RetrievalDetails } from "./search.ts"
import { findCachedAnswer } from "./cache.ts"

export type RAGContext = {
  results: SearchResult[]
  pinnedAnswer: string | null
  cached: boolean
  cachedAnswer: string | null
  memoryTier: string
  retrievalDetails?: RetrievalDetails
}

export async function runRAGPipeline(
  db: Database.Database,
  question: string,
  _sessionMessages: { role: string; content: string }[] = []
): Promise<RAGContext> {
  // 1. Check cache first
  const cached = await findCachedAnswer(db, question)
  if (cached) {
    return {
      results: [],
      pinnedAnswer: null,
      cached: true,
      cachedAnswer: cached.answer,
      memoryTier: "cache",
    }
  }

  // 2. Check pinned Q&A (highest priority)
  // pinned_qa table may not exist in Phase 2 — graceful fallback
  const hasPinnedTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pinned_qa'`)
    .get() as { name: string } | undefined

  if (hasPinnedTable) {
    const pinnedQas = queryMany<{ question: string; answer: string }>(
      db,
      `SELECT question, answer FROM pinned_qa`,
      []
    )

    if (pinnedQas.length > 0) {
      const questionLower = question.toLowerCase()
      const pinnedMatch = pinnedQas.find(
        (qa) =>
          questionLower.includes(qa.question.toLowerCase().slice(0, 20)) ||
          qa.question.toLowerCase().includes(questionLower.slice(0, 20))
      )

      if (pinnedMatch) {
        return {
          results: [],
          pinnedAnswer: pinnedMatch.answer,
          cached: false,
          cachedAnswer: null,
          memoryTier: "pinned",
        }
      }
    }
  }

  // 3. Hybrid search: vector + concept + episodic boost
  const { results, details } = await hybridSearch(db, question)

  const hasVector = details.vector_results.length > 0
  const hasConcept = details.concept_results.length > 0
  const hasTemporal = details.temporal_results.length > 0
  let memoryTier = "none"
  if (hasConcept) memoryTier = "concept"
  else if (hasTemporal) memoryTier = "temporal"
  else if (hasVector) memoryTier = "vector"

  return {
    results,
    pinnedAnswer: null,
    cached: false,
    cachedAnswer: null,
    memoryTier,
    retrievalDetails: details,
  }
}
