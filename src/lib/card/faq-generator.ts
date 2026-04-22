/**
 * faq-generator.ts — FAQ generation from conversation clusters.
 *
 * Porting changes from Volla:
 *   - user_id removed throughout (porting-rules: user_id removal)
 *   - $n → ? (porting-rules rule 1)
 *   - ANY($1) → IN (?,?,...) (porting-rules rule 7)
 *   - question_embedding BLOB → blobToEmbedding() (porting-rules rule 5)
 *   - conversations/faqs tables may not exist in Phase 2 — graceful guard
 *   - better-sqlite3 is sync: no await on db calls
 */
import { queryMany, execute, type Database } from "../db/index.ts"
import { blobToEmbedding, embeddingToBlob } from "../rag/embed.ts"

type ConversationRow = {
  id: string
  question: string
  answer: string
  question_embedding: Buffer | null
  feedback: number | null
}

type QuestionCluster = {
  representative: string
  bestAnswer: string
  count: number
  embedding: number[]
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0
  return dot / denom
}

function clusterQuestions(
  conversations: ConversationRow[],
  threshold = 0.85
): QuestionCluster[] {
  const clusters: {
    members: ConversationRow[]
    centroid: number[]
  }[] = []

  for (const conv of conversations) {
    if (!conv.question_embedding) continue
    const embedding = blobToEmbedding(conv.question_embedding)
    if (embedding.length === 0) continue

    let bestCluster = -1
    let bestSim = 0

    for (let i = 0; i < clusters.length; i++) {
      const sim = cosineSimilarity(embedding, clusters[i].centroid)
      if (sim > bestSim) {
        bestSim = sim
        bestCluster = i
      }
    }

    if (bestSim >= threshold && bestCluster >= 0) {
      clusters[bestCluster].members.push(conv)
    } else {
      clusters.push({
        members: [conv],
        centroid: embedding,
      })
    }
  }

  return clusters
    .filter((c) => c.members.length >= 2)
    .map((cluster) => {
      const sorted = [...cluster.members].sort((a, b) => {
        const aScore = (a.feedback === 1 ? 10 : 0) + a.answer.length / 100
        const bScore = (b.feedback === 1 ? 10 : 0) + b.answer.length / 100
        return bScore - aScore
      })

      return {
        representative: sorted[0].question,
        bestAnswer: sorted[0].answer,
        count: cluster.members.length,
        embedding: cluster.centroid,
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

export function generateFAQs(
  db: Database.Database
): { generated: number; total: number } {
  // Guard: conversations table may not exist in Phase 2
  const hasConvTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'`)
    .get() as { name: string } | undefined

  if (!hasConvTable) return { generated: 0, total: 0 }

  const hasFaqTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='faqs'`)
    .get() as { name: string } | undefined

  if (!hasFaqTable) return { generated: 0, total: 0 }

  const conversations = queryMany<ConversationRow>(
    db,
    `SELECT id, question, answer, question_embedding, feedback
     FROM conversations
     WHERE answer IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 200`,
    []
  )

  if (!conversations || conversations.length < 5) {
    return { generated: 0, total: conversations?.length ?? 0 }
  }

  const clusters = clusterQuestions(conversations)

  if (clusters.length === 0) {
    return { generated: 0, total: conversations.length }
  }

  // Delete old FAQs
  execute(db, `DELETE FROM faqs`, [])

  // Insert new FAQs
  for (const cluster of clusters) {
    const newId = crypto.randomUUID()
    // embedding stored as BLOB (porting-rules rule 5)
    const embeddingBlob = embeddingToBlob(cluster.embedding)
    execute(
      db,
      `INSERT INTO faqs (id, question, answer, source_count, representative_embedding)
       VALUES (?, ?, ?, ?, ?)`,
      [newId, cluster.representative, cluster.bestAnswer, cluster.count, embeddingBlob]
    )
  }

  return { generated: clusters.length, total: conversations.length }
}

export function getFAQs(
  db: Database.Database
): { id: string; question: string; answer: string; source_count: number; updated_at: string }[] {
  const hasTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='faqs'`)
    .get() as { name: string } | undefined

  if (!hasTable) return []

  return queryMany<{
    id: string
    question: string
    answer: string
    source_count: number
    updated_at: string
  }>(
    db,
    `SELECT id, question, answer, source_count, updated_at
     FROM faqs
     ORDER BY source_count DESC
     LIMIT 5`,
    []
  )
}
