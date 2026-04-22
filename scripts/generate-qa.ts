/**
 * generate-qa.ts — 3-tier FAQ generation via Claude Code CLI subprocess.
 * PGR-3: No OpenRouter. Uses `callClaude()` which shells out to `claude -p`.
 * FGR-2: Cache hash = sha256(content + PROMPT_VERSION + MODEL_VERSION).
 * FGR-3: Per-note progress + ETA.
 */
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { createDb, queryMany, queryOne, execute, type Database } from "../src/lib/db/index.ts"
import { checkClaudeAvailable, callClaude, retryWithBackoff, MODEL_VERSION } from "../src/lib/llm/claude-code.ts"
import { buildFaqPrompt, sanitizeForPrompt, PROMPT_VERSION } from "../src/lib/llm/prompts/faq-generate.ts"

const DB_PATH = process.env.MESHBLOG_DB ?? ".data/index.db"
const QA_DIR = ".data/qa"

const args = process.argv.slice(2)
const FLAG_FORCE = args.includes("--force")
const FLAG_RESUME = args.includes("--resume-from") || args.includes("--resume")
const FLAG_CLEAR = args.includes("--clear")
const FLAG_DRY_RUN = args.includes("--dry-run")
const TIER_FILTER = args.find((a) => a.startsWith("--tier="))?.replace("--tier=", "") ?? null
const NOTE_FILTER = args.find((a) => a.startsWith("--note="))?.replace("--note=", "") ?? null

type FaqItem = { question: string; answer: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentHash(content: string): string {
  return createHash("sha256").update(content + PROMPT_VERSION + MODEL_VERSION).digest("hex")
}

function qaJsonPath(tier: string, id: string): string {
  return join(QA_DIR, tier, `${id}.json`)
}

function formatEta(startMs: number, done: number, total: number): string {
  if (done === 0) return "?"
  const elapsed = (Date.now() - startMs) / 1000
  const avgPerNote = elapsed / done
  const remaining = (total - done) * avgPerNote
  return `${Math.ceil(remaining / 60)}m`
}

function insertQaCard(
  db: Database.Database,
  tier: string,
  noteId: string | null,
  conceptId: string | null,
  question: string,
  answer: string,
  hash: string,
): void {
  execute(
    db,
    `INSERT INTO qa_cards (id, tier, note_id, concept_id, question, answer, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), tier, noteId, conceptId, question, answer, hash],
  )
}

/**
 * Parse FAQ response from callClaude (which returns parsed JSON).
 * Handles both raw object and nested `result` field from CC CLI output.
 */
function parseFaqs(response: unknown): FaqItem[] {
  // Claude Code CLI wraps the JSON output in a result envelope
  let data = response
  if (
    typeof response === "object" &&
    response !== null &&
    "result" in response
  ) {
    const envelope = response as { result: unknown }
    if (typeof envelope.result === "string") {
      try {
        data = JSON.parse(envelope.result)
      } catch {
        data = envelope.result
      }
    } else {
      data = envelope.result
    }
  }

  if (typeof data === "object" && data !== null && "faqs" in data) {
    const faqs = (data as { faqs: unknown }).faqs
    if (Array.isArray(faqs)) {
      return faqs
        .filter((f): f is FaqItem =>
          typeof f === "object" && f !== null &&
          typeof (f as FaqItem).question === "string" &&
          typeof (f as FaqItem).answer === "string",
        )
    }
  }
  return []
}

async function generateFaqs(
  tier: "note" | "concept" | "global",
  context: string,
  count: number,
): Promise<FaqItem[]> {
  const messages = buildFaqPrompt({ tier, context, count })
  const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")

  const response = await retryWithBackoff(() => callClaude(prompt), {
    retries: 3,
    baseMs: 1000,
    maxMs: 10000,
  })

  const faqs = parseFaqs(response)
  if (faqs.length === 0) {
    console.warn(`[generate-qa] warning: got 0 FAQs for tier=${tier}. Response:`, JSON.stringify(response).slice(0, 300))
  }
  return faqs
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── FIXTURE_ONLY mode: skip entirely — qa_cards are preseeded ──
  if (process.env.FIXTURE_ONLY === "1") {
    console.log("[generate-qa] FIXTURE_ONLY=1 — skipping (qa_cards preseeded)")
    process.exit(0)
  }

  // Env + tool checks
  checkClaudeAvailable()
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "[generate-qa] FATAL: OPENAI_API_KEY is not set.\n" +
      "  Problem: embeddings still require OpenAI API key.\n" +
      "  Cause:   OPENAI_API_KEY missing from .env.local.\n" +
      "  Fix:     Add OPENAI_API_KEY=sk-... to .env.local",
    )
    process.exit(1)
  }

  const db = createDb(DB_PATH)

  // Ensure qa_cards has content_hash column (FGR-2)
  const qaInfo = db.pragma("table_info(qa_cards)") as { name: string }[]
  if (!qaInfo.find((c) => c.name === "content_hash")) {
    db.exec("ALTER TABLE qa_cards ADD COLUMN content_hash TEXT")
  }

  // Ensure qa_run table exists for resume support (Amendment D)
  db.exec(`
    CREATE TABLE IF NOT EXISTS qa_run (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_tiers TEXT NOT NULL DEFAULT '[]',
      last_error TEXT
    )
  `)

  // --clear: wipe existing QA cards
  if (FLAG_CLEAR) {
    console.log("[generate-qa] --clear: deleting all qa_cards...")
    execute(db, "DELETE FROM qa_cards", [])
    execute(db, "DELETE FROM qa_run", [])
  }

  // Fetch data
  let notes = queryMany<{ id: string; slug: string; title: string; content: string }>(
    db,
    "SELECT id, slug, title, content FROM notes WHERE graph_status='done'",
    [],
  )
  const concepts = queryMany<{ id: string; name: string; description: string }>(
    db,
    "SELECT id, name, description FROM concepts",
    [],
  )

  // Apply filters
  if (NOTE_FILTER) {
    notes = notes.filter((n) => n.id === NOTE_FILTER || n.slug === NOTE_FILTER)
  }

  const runTiers = {
    note: !TIER_FILTER || TIER_FILTER === "note",
    concept: !TIER_FILTER || TIER_FILTER === "concept",
    global: !TIER_FILTER || TIER_FILTER === "global",
  }

  // --dry-run: count + estimate
  if (FLAG_DRY_RUN) {
    const noteCount = runTiers.note ? notes.length : 0
    const conceptCount = runTiers.concept ? concepts.length : 0
    const globalCount = runTiers.global ? 1 : 0
    const totalItems = noteCount + conceptCount + globalCount
    const estMin = Math.ceil(totalItems * 3 / 60)
    console.log(
      `[generate-qa] DRY RUN — no API calls made.\n` +
      `  Notes (5 FAQs each): ${noteCount}\n` +
      `  Concepts (3 FAQs each): ${conceptCount}\n` +
      `  Global tier: ${globalCount}\n` +
      `  Total items: ${totalItems}\n` +
      `  Estimated wall-clock: ~${estMin} min (based on 3s/item)\n` +
      `  Claude Code model: ${MODEL_VERSION}\n` +
      `  Prompt version: ${PROMPT_VERSION}`,
    )
    db.close()
    return
  }

  // Setup output dirs
  mkdirSync(join(QA_DIR, "note"), { recursive: true })
  mkdirSync(join(QA_DIR, "concept"), { recursive: true })
  mkdirSync(join(QA_DIR, "global"), { recursive: true })

  let totalRegenerated = 0
  let totalCached = 0
  const runStart = Date.now()

  console.log(
    `Generating Q&A for ${notes.length} notes. ` +
    `Estimated: ~${Math.ceil(notes.length * 3 / 60)}min based on 3s/note prior run.`,
  )

  // ── Tier 1: per-note ───────────────────────────────────────────────────────
  if (runTiers.note) {
    console.log(`\n[generate-qa] Tier 1: per-note (${notes.length} notes)`)

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]
      const elapsed = Math.round((Date.now() - runStart) / 1000)
      const eta = formatEta(runStart, i, notes.length)

      console.log(`[${i + 1}/${notes.length}] ${note.slug} (${elapsed}s, ETA ${eta})`)

      const sanitized = sanitizeForPrompt(`${note.title}\n\n${note.content}`)
      const hash = contentHash(sanitized)
      const outPath = qaJsonPath("note", note.id)

      // Cache skip (FGR-2): check stored hash in qa_cards
      const existing = queryOne<{ content_hash: string | null }>(
        db,
        "SELECT content_hash FROM qa_cards WHERE tier='note' AND note_id=? LIMIT 1",
        [note.id],
      )

      if (!FLAG_FORCE && existing?.content_hash === hash) {
        if (!FLAG_RESUME || existsSync(outPath)) {
          console.log(`  → cached (hash match), skipping`)
          totalCached++
          continue
        }
      }

      // --resume: skip if JSON file already written
      if (FLAG_RESUME && existsSync(outPath)) {
        console.log(`  → resume: JSON exists, skipping`)
        totalCached++
        continue
      }

      try {
        const faqs = await generateFaqs("note", sanitized, 5)

        // Delete old cards for this note (idempotency, Amendment D)
        execute(db, "DELETE FROM qa_cards WHERE tier='note' AND note_id=?", [note.id])

        // Write to DB + JSON
        const tx = db.transaction(() => {
          for (const f of faqs) {
            insertQaCard(db, "note", note.id, null, f.question, f.answer, hash)
          }
        })
        tx()

        writeFileSync(outPath, JSON.stringify({ tier: "note", note_id: note.id, faqs }, null, 2))
        totalRegenerated++
        console.log(`  → ${faqs.length} FAQs generated`)
      } catch (err) {
        console.error(`  → ERROR: ${(err as Error).message}`)
      }
    }
  }

  // ── Tier 2: per-concept ───────────────────────────────────────────────────
  if (runTiers.concept && concepts.length > 0) {
    console.log(`\n[generate-qa] Tier 2: per-concept (${concepts.length} concepts)`)

    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i]
      console.log(`[${i + 1}/${concepts.length}] concept: ${concept.name}`)

      const entities = queryMany<{ name: string }>(
        db,
        `SELECT e.name FROM concept_entities ce
         JOIN entities e ON e.id = ce.entity_id
         WHERE ce.concept_id = ?`,
        [concept.id],
      )
      const topNotes = queryMany<{ title: string }>(
        db,
        `SELECT DISTINCT n.title FROM concept_entities ce
         JOIN entities e ON e.id = ce.entity_id
         JOIN note_entities ne ON ne.entity_id = e.id
         JOIN notes n ON n.id = ne.note_id
         WHERE ce.concept_id = ?
         LIMIT 5`,
        [concept.id],
      )

      const ctx = [
        `Concept: ${concept.name}`,
        concept.description ? `Description: ${concept.description}` : "",
        entities.length > 0 ? `Related topics: ${entities.map((e) => e.name).join(", ")}` : "",
        topNotes.length > 0 ? `Related notes: ${topNotes.map((n) => n.title).join(", ")}` : "",
      ].filter(Boolean).join("\n")

      const sanitized = sanitizeForPrompt(ctx)
      const hash = contentHash(sanitized)
      const outPath = qaJsonPath("concept", concept.id)

      const existing = queryOne<{ content_hash: string | null }>(
        db,
        "SELECT content_hash FROM qa_cards WHERE tier='concept' AND concept_id=? LIMIT 1",
        [concept.id],
      )

      if (!FLAG_FORCE && existing?.content_hash === hash) {
        if (!FLAG_RESUME || existsSync(outPath)) {
          console.log(`  → cached, skipping`)
          totalCached++
          continue
        }
      }

      if (FLAG_RESUME && existsSync(outPath)) {
        console.log(`  → resume: JSON exists, skipping`)
        totalCached++
        continue
      }

      try {
        const faqs = await generateFaqs("concept", sanitized, 3)

        execute(db, "DELETE FROM qa_cards WHERE tier='concept' AND concept_id=?", [concept.id])

        const tx = db.transaction(() => {
          for (const f of faqs) {
            insertQaCard(db, "concept", null, concept.id, f.question, f.answer, hash)
          }
        })
        tx()

        writeFileSync(outPath, JSON.stringify({ tier: "concept", concept_id: concept.id, faqs }, null, 2))
        totalRegenerated++
        console.log(`  → ${faqs.length} FAQs generated`)
      } catch (err) {
        console.error(`  → ERROR: ${(err as Error).message}`)
      }
    }
  }

  // ── Tier 3: global ────────────────────────────────────────────────────────
  if (runTiers.global) {
    console.log(`\n[generate-qa] Tier 3: global`)

    const top10 = queryMany<{ name: string; description: string }>(
      db,
      "SELECT name, description FROM concepts ORDER BY confidence DESC LIMIT 10",
      [],
    )

    if (top10.length === 0) {
      // Fall back to top entities if no concepts yet
      const topEntities = queryMany<{ name: string; entity_type: string }>(
        db,
        "SELECT name, entity_type FROM entities ORDER BY mention_count DESC LIMIT 10",
        [],
      )
      top10.push(
        ...topEntities.map((e) => ({ name: e.name, description: e.entity_type })),
      )
    }

    const globalCtx = top10
      .map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ""}`)
      .join("\n")

    const fullCtx = sanitizeForPrompt(
      `This is a personal knowledge base (second brain). Key themes:\n${globalCtx}`,
    )
    const hash = contentHash(fullCtx)
    const outPath = qaJsonPath("global", "vault")

    const existing = queryOne<{ content_hash: string | null }>(
      db,
      "SELECT content_hash FROM qa_cards WHERE tier='global' LIMIT 1",
      [],
    )

    const shouldSkip =
      !FLAG_FORCE &&
      existing?.content_hash === hash &&
      (!FLAG_RESUME || existsSync(outPath))

    if (shouldSkip) {
      console.log(`  → global cached, skipping`)
      totalCached++
    } else if (FLAG_RESUME && existsSync(outPath)) {
      console.log(`  → resume: global JSON exists, skipping`)
      totalCached++
    } else {
      try {
        const faqs = await generateFaqs("global", fullCtx, 5)

        execute(db, "DELETE FROM qa_cards WHERE tier='global'", [])

        const tx = db.transaction(() => {
          for (const f of faqs) {
            insertQaCard(db, "global", null, null, f.question, f.answer, hash)
          }
        })
        tx()

        writeFileSync(outPath, JSON.stringify({ tier: "global", faqs }, null, 2))
        totalRegenerated++
        console.log(`  → ${faqs.length} global FAQs generated`)
      } catch (err) {
        console.error(`  → ERROR generating global FAQs: ${(err as Error).message}`)
      }
    }
  }

  const totalMin = Math.round((Date.now() - runStart) / 60000)
  console.log(
    `\nDone. Total: ${totalMin}min. Regenerated: ${totalRegenerated}. Cached: ${totalCached}.`,
  )

  db.close()
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("generate-qa.ts")

if (isMainModule) {
  main().catch((err) => {
    console.error("[generate-qa] FATAL:", err)
    process.exit(1)
  })
}
