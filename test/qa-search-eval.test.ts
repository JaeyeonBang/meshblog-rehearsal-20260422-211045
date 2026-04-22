/**
 * QA Search Quality Evaluation — CI recall gate
 *
 * Verifies that the Fuse.js config used by QAChips.tsx maintains at least
 * 70% recall@3 across a hand-crafted set of realistic user queries.
 *
 * SYNC NOTE: The fuseOptions constant below MUST stay in sync with
 * QAChips.tsx (src/components/QAChips.tsx). If you change the Fuse config
 * there, update it here too.
 *
 * QAChips.tsx branches on scope:
 *   scope === 'global' → keys: ['question']
 *   scope === 'page'   → keys: [{name:'question',weight:2},{name:'answer',weight:1}]
 * Both branches use threshold: 0.4.
 *
 * This test uses the "page" scope config (broader recall) which is the right
 * configuration to guard against regressions across all tiers.
 */

import { describe, it, expect } from 'vitest'
import Fuse, { type IFuseOptions } from 'fuse.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QaCard = {
  id: string
  tier: 'note' | 'concept' | 'global'
  question: string
  answer: string
}

type EvalQuery = {
  query: string
  expected_ids: string[]
  comment?: string
}

// ---------------------------------------------------------------------------
// Fuse config — KEEP IN SYNC WITH QAChips.tsx (page scope)
// ---------------------------------------------------------------------------
const fuseOptions: IFuseOptions<QaCard> = {
  keys: [
    { name: 'question', weight: 2 },
    { name: 'answer', weight: 1 },
  ],
  threshold: 0.4,
  includeScore: true,
}

// ---------------------------------------------------------------------------
// Parse qa_cards from seed.sql (hermetic — no DB connection required)
//
// Matches each VALUES row:
//   ('id','tier',note_id_or_NULL,concept_id_or_NULL,'question','answer','hash')
// Note: 3rd/4th columns may be NULL or 'string'; we skip them via [^,]+
// ---------------------------------------------------------------------------
function parseQaCardsFromSql(sql: string): QaCard[] {
  const block = sql.match(
    /INSERT INTO qa_cards[\s\S]*?VALUES\s*([\s\S]*?);\s*(?:--|$)/
  )?.[1]

  if (!block) {
    throw new Error('Could not find qa_cards INSERT block in seed.sql')
  }

  const rowPattern =
    /\('(q[^']+)','(note|concept|global)',[^,]+,[^,]+,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/gms

  const cards: QaCard[] = []
  let m: RegExpExecArray | null
  while ((m = rowPattern.exec(block)) !== null) {
    const [, id, tier, question, answer] = m
    cards.push({
      id,
      tier: tier as QaCard['tier'],
      question: question.replace(/''/g, "'"),
      answer: answer.replace(/''/g, "'"),
    })
  }

  return cards
}

// ---------------------------------------------------------------------------
// Load fixtures
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures')

const seedSql = readFileSync(join(fixturesDir, 'seed.sql'), 'utf-8')
const qaCards = parseQaCardsFromSql(seedSql)

const evalQueries: EvalQuery[] = JSON.parse(
  readFileSync(join(fixturesDir, 'qa-eval-queries.json'), 'utf-8')
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QA search quality — recall@3 gate', () => {
  it('seed.sql contains at least 20 qa_cards', () => {
    expect(qaCards.length).toBeGreaterThanOrEqual(20)
    console.log(`Loaded ${qaCards.length} qa_cards from seed.sql`)
  })

  it('eval fixture contains at least 10 queries', () => {
    expect(evalQueries.length).toBeGreaterThanOrEqual(10)
  })

  it('average recall@3 >= 0.70 across all eval queries', () => {
    const fuse = new Fuse(qaCards, fuseOptions)

    const perQueryRecall: number[] = []

    for (const { query, expected_ids } of evalQueries) {
      const results = fuse.search(query).slice(0, 3)
      const returnedIds = new Set(results.map(r => r.item.id))

      const hits = expected_ids.filter(id => returnedIds.has(id)).length
      const recall = hits / expected_ids.length

      perQueryRecall.push(recall)

      console.log(
        `[${recall === 1 ? 'PASS' : recall > 0 ? 'PART' : 'FAIL'}]` +
          ` recall=${recall.toFixed(2)}` +
          ` query="${query}"`
      )
    }

    const avgRecall =
      perQueryRecall.reduce((a, b) => a + b, 0) / perQueryRecall.length

    console.log(
      `\nAverage recall@3: ${avgRecall.toFixed(4)} (${(avgRecall * 100).toFixed(1)}%)` +
        ` — threshold: 70.0%`
    )

    expect(avgRecall).toBeGreaterThanOrEqual(0.7)
  })
})
