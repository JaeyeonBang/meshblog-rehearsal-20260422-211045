/**
 * cache.ts — RAG answer cache.
 *
 * RESERVE (미사용 / 예비): meshblog is pre-gen → no runtime chatbot in Phase 2.
 * Port is mechanical per plan Task 7 / Patch A5.
 * Phase 4 /ask endpoint will activate this.
 *
 * Porting changes from Volla:
 *   - user_id removed throughout (porting-rules: user_id removal)
 *   - pgvector match_conversations() → JS cosine over conversations table (porting-rules rule 5)
 *   - $n → ? (porting-rules rule 1)
 *   - conversations table may not exist in Phase 2 DB — graceful fallback
 */
import { queryMany, type Database } from "../db/index.ts"
import { generateEmbedding, blobToEmbedding } from "./embed.ts"
import { cosine } from "../llm/cosine.ts"

export type CachedAnswer = {
  answer: string
  context_used: unknown[]
}

export async function findCachedAnswer(
  db: Database.Database,
  question: string,
  threshold = 0.95
): Promise<CachedAnswer | null> {
  try {
    // conversations table may not exist in Phase 2 schema
    const hasTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'`
      )
      .get() as { name: string } | undefined

    if (!hasTable) return null

    const questionEmbedding = await generateEmbedding(question)

    // Load all conversation embeddings and compute similarity in JS
    // TODO: replaced by JS cosine (porting-rules rule 5 — was match_conversations($1, $2, $3))
    const rows = queryMany<{
      answer: string
      context_used: string
      question_embedding: Buffer | null
    }>(
      db,
      `SELECT answer, context_used, question_embedding
       FROM conversations
       WHERE answer IS NOT NULL AND question_embedding IS NOT NULL`,
      []
    )

    let bestMatch: { answer: string; context_used: string; score: number } | null = null

    for (const row of rows) {
      if (!row.question_embedding) continue
      const rowEmbedding = blobToEmbedding(row.question_embedding)
      const score = cosine(questionEmbedding, rowEmbedding)
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { answer: row.answer, context_used: row.context_used, score }
      }
    }

    if (!bestMatch) return null

    return {
      answer: bestMatch.answer,
      context_used: (() => {
        try { return JSON.parse(bestMatch.context_used) as unknown[] } catch { return [] }
      })(),
    }
  } catch {
    return null
  }
}
