# Phase 2 Retro — Agent C (Tasks 9–14)

**Agent:** Phase 2 Agent C (Scripts + Tests + Dry-Run)  
**Date:** 2026-04-18  
**Commit range:** 2d4ed0c → 7bb9f63 (from Agent A's 42c7aa2)

---

## What Was Built (Checklist)

| Task | Item | Status | Notes |
|------|------|--------|-------|
| 5a | `src/lib/llm/claude-code.ts` — subprocess wrapper | ✅ DONE | callClaude, retryWithBackoff, checkClaudeAvailable, MODEL_VERSION |
| 9 | `scripts/build-index.ts` — embed + concept stages | ✅ DONE | Stages 2+3 added; --skip-embed/--skip-concepts flags; hash-reconcile for missing embeddings |
| 9 | `schema.sql` — `notes.level_pin` column | ✅ DONE | Amendment A |
| 9 | `migrate.ts` — WAL + busy_timeout + ALTER TABLE | ✅ DONE | Amendment A + DX #3 + DX #9 |
| 10 | `scripts/generate-qa.ts` — 3-tier FAQ via CC CLI | ✅ DONE | PGR-3: no OpenRouter; FGR-2: content hash cache; FGR-3: progress UI |
| 10 | `src/lib/llm/prompts/faq-generate.ts` | ✅ DONE | PROMPT_VERSION, buildFaqPrompt, sanitizeForPrompt |
| 11 | `scripts/export-graph.ts` — PageRank + 6 JSON exports | ✅ DONE | Patch C + Amendment E; note + concept graphs; level_pin override; neighbor promotion |
| 12 | `claude-code.test.ts` | ✅ DONE | spawn mock, happy/exit-code-nonzero/malformed-JSON |
| 12 | `porting-rules-lint.test.ts` | ✅ DONE | 6 pg pattern checks; regex-replacement false-positive exemption |
| 12 | `schema-fk-type-lint.test.ts` | ✅ DONE | FK column type matches referenced PK (F1 rule) |
| 12 | `cosine.test.ts` | ✅ DONE | cosine(a,a)=1, orthogonal=0, topKByCosine ranking |
| 12 | `embed-blob.test.ts` | ✅ DONE | 1536-dim round-trip (Float32Array ↔ Buffer) |
| 12 | `export-graph.test.ts` | ✅ DONE | 6 files, superset, empty vault, level_pin pin |
| 12 | `generate-qa.test.ts` | ✅ DONE | cache hash invalidation on PROMPT_VERSION + MODEL_VERSION bump |
| 13 | 20-note fixture vault | ✅ DONE | 16 synthetic notes added (04–20), 21 total |
| 13 | 20-note dry-run (structural) | ✅ DONE | --skip-embed --skip-concepts runs clean; export-graph produces 6 empty JSON |
| 13 | 20-note dry-run (with real API) | 🔶 DEFERRED | Requires OPENAI_API_KEY + OPENROUTER_API_KEY in .env.local |
| 13 | 200-note scaling run | 🔶 DEFERRED | Requires user to provide 200-note vault (not faked per instructions) |
| 13 | `docs/quota-log.md` | ✅ DONE | Projected costs; structural timing; deferred dry-run criteria |
| 14 | `docs/plans/phase2-retro.md` | ✅ DONE | This file |

**Not in scope for Agent C** (Agent B's domain):  
- `src/lib/rag/graph-topology.ts` — Louvain + runLouvain + runPageRank  
- `src/lib/rag/concepts.ts` — buildConceptsFromCommunities  
- `src/lib/rag/search.ts`, `embed.ts` extensions, card/ files

---

## What Broke During Development + Fixes Applied

### B1 — embed.ts module-level API key throw

**Problem:** `embed.ts` called `throw new Error("OPENAI_API_KEY is required")` at module import time. Any test that imported `build-index.ts` (which imports `embed.ts`) crashed before the test ran — even for the `embeddingToBlob` pure function that doesn't need an API key.

**Fix:** Made API key validation lazy — moved check inside `getOpenAI()` function body. Only fails when `generateEmbedding()` is actually called. `chunkText`, `embeddingToBlob`, `blobToEmbedding` work without a key.

### B2 — claude-code.test.ts mock timing

**Problem:** `vi.doMock("node:child_process", ...)` was too late — the module was already cached from the import statement.

**Fix:** Switched to `vi.mock("node:child_process", ...)` at the TOP of the test file (hoisted by vitest before imports) + `vi.spyOn(childProcess, "spawn")` inside each test. This ensures mocks apply before the module under test loads.

### B3 — `mockReturnValue` bleeding between tests

**Problem:** `spawnSpy.mockReturnValue(...)` persists across tests. `afterEach(() => vi.clearAllMocks())` clears call records but NOT the implementation. The "malformed JSON" test received the stale mock from the previous "exit-code-nonzero" test.

**Fix:** Changed `vi.clearAllMocks()` to `vi.resetAllMocks()` (clears implementations too) + switched to `mockReturnValueOnce()` in each test so the mock is consumed.

### B4 — pagerank import style

**Problem:** `import { pagerank } from "graphology-metrics/centrality/pagerank"` caused a TypeScript error: "has no exported member 'pagerank'". The module uses `export default pagerank`.

**Fix:** Changed to `import pagerank from "graphology-metrics/centrality/pagerank"`.

### B5 — porting-rules-lint false positive on regex `$1`

**Problem:** `skill-scorer.ts` (Agent B's file) contains `.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")` — a regex capture group substitution. The lint pattern `/\$[1-9]\b/` matched the `$1` in the replacement string, flagging it as a PostgreSQL positional parameter.

**Fix:** Added `skipLinePattern: /\.replace\s*\(|\/\$[1-9]/` exemption for lines containing `.replace(`. The lint now skips regex-replacement lines.

### B6 — build-index tests missing `skipEmbed: true`

**Problem:** Original tests called `runBuildIndex()` without flags, hitting the new `OPENAI_API_KEY` fail-fast check and calling `process.exit(1)`.

**Fix:** Added `skipEmbed: true, skipConcepts: true` to all test calls. Tests now exercise the entity extraction stage only (which uses a stubbed `extract` function).

---

## Lessons Learned (for Phase 3)

1. **Lazy API key validation beats module-level guards.** Module-level guards break tests that only need pure functions from the same module. Guard at the point of API use.

2. **vi.mock must be at top-level, not inside beforeEach.** Vitest hoists `vi.mock()` calls before imports. `vi.doMock()` doesn't work for modules already in the cache.

3. **Use `resetAllMocks()` not `clearAllMocks()` when mock implementations must not bleed.** `clearAllMocks()` only clears call counts; `resetAllMocks()` clears the implementation too.

4. **Defensive dynamic imports for Agent B dependencies.** Rather than hard-importing `graph-topology.ts` and `concepts.ts` (which Agent B owns), use `await import(...)` inside a try/catch. If Agent B hasn't landed yet, the script logs a warning and continues. This let Agent C proceed in parallel without blocking.

5. **Default-export vs named-export matters for TypeScript.** When porting Volla's `graphology-metrics` usage, always check `.d.ts` files to confirm export style before writing imports.

6. **The `--skip-*` flag pattern is essential.** Without `--skip-embed` and `--skip-concepts`, every test run hits OpenAI APIs. The flags enable fast local test/dev cycles.

7. **porting-rules-lint needs context awareness.** Static regex lint is fragile — `$1` appears in regex replacement strings, TypeScript template literals, and SQL parameters. The exemption pattern (`skipLinePattern`) is a pragmatic fix but not perfect. Phase 3 improvement: check context (inside template literal `\`...\$1...\`` vs inside SQL string `"SELECT ... $1"`).

---

## Metrics

| Metric | Value |
|--------|-------|
| Files created | 15 |
| Files modified | 7 |
| Lines of code (new) | ~2,000 |
| Tests (total) | 59 (up from 6) |
| Test files | 9 (7 new) |
| TypeScript errors | 0 |
| Commits (Agent C) | 9 |
| Fixture notes | 21 (16 new) |
| Dry-run 20-note (structural) | <5s (schema + notes, no API) |
| Dry-run 20-note (full) | DEFERRED |
| Dry-run 200-note | DEFERRED |

---

## Kill Gate Assessment

| Gate | Threshold | Status | Evidence |
|------|-----------|--------|----------|
| TypeScript compiles | 0 errors | ✅ PASS | `bunx tsc --noEmit` → clean |
| 59 tests green | 0 failures | ✅ PASS | `bun run test` → 59/59 |
| 6 graph JSON files | Valid schema | ✅ PASS | export-graph test + manual run |
| Level superset (L3 ⊇ L1) | All L1 nodes in L3 | ✅ PASS | export-graph.test.ts |
| Empty vault safe | 6 empty JSON files | ✅ PASS | export-graph.test.ts empty vault case |
| level_pin override | L1 pin in L1 JSON | ✅ PASS | export-graph.test.ts level_pin test |
| FK type lint | entity_id = INTEGER | ✅ PASS | schema-fk-type-lint.test.ts |
| Porting rules lint | No $n/::uuid/NOW()/etc | ✅ PASS | porting-rules-lint.test.ts |
| Q&A cache invalidation | PROMPT_VERSION bump → cache miss | ✅ PASS | generate-qa.test.ts |
| Full pipeline (20 notes) | All 9 tables populated | 🔶 DEFERRED | Needs live API keys |
| Concepts ≥ 3 | Louvain clusters | 🔶 DEFERRED | Needs Agent B + live API |
| Q&A rows per tier | note≥20, concept≥3, global≥5 | 🔶 DEFERRED | Needs live Claude Code CLI |
| Build time < 5min | 20 notes | 🔶 DEFERRED | Live run needed |
| Cost < $1 (20 notes) | Embeddings only | 🔶 LIKELY PASS | Projected: ~$0.026 |

**Overall: CONDITIONAL PASS.** Architecture is complete and tested. Full pipeline validation requires live API credentials and a running Claude Code session.

---

## Deferred Items for Phase 3

1. **Full 20-note + 200-note dry-run** with live OPENAI_API_KEY + OPENROUTER_API_KEY + claude binary. Update `docs/quota-log.md` with real timings.

2. **Agent B integration test** — once `graph-topology.ts` and `concepts.ts` land, add `build-index.test.ts` case that exercises the full pipeline including Louvain + concept creation.

3. **`graph-topology.test.ts`** — plan specifies Louvain on known graph + PageRank ranking test (Task 12 test #10). Blocked on Agent B's `computeEntityCommunities` export.

4. **`build-index.test.ts` F8 tests** — 5 failure mode tests (Amendment F #10-14):
   - hash-skip reconciliation (embedding deleted, expect restoration)
   - partial embedding failure (mock throws on chunk 3)
   - Louvain 0 communities
   - `public: false` transition (stale embeddings cleanup)

5. **200-note synthetic vault generator** — if the user can't provide a real vault, create `scripts/generate-fixture-notes.ts` that generates 200 templated MD files with varied entity overlap to exercise Louvain quality.

6. **Astro page integration** — Phase 3 will consume `public/graph/*.json` and `qa_cards` table to render interactive graph + FAQ chips.

7. **`--build-all` integration test** — verify the full 3-script pipeline (`build-index → generate-qa → export-graph`) works end-to-end with a live environment.

---

## Phase 3 Recommendations

1. **Start with README finalization** (FGR-1 polish pass) — fill in all stub sections with actual timings from dry-run.

2. **Check Agent B's graph-topology.ts and concepts.ts** before proceeding — Agent C's build-index.ts uses them via dynamic import with a graceful fallback. Verify the exports match the expected signatures (`computeEntityCommunities`, `buildConceptsFromCommunities`).

3. **Run full 20-note dry-run first** before scaling to 200 notes. The structural tests pass but real API behavior (entity extraction quality, embedding dimensions, Louvain community count) must be verified.

4. **Phase 3 scope**: Astro pages + React islands + graph visualization (d3-force) + Fuse.js search. Input: Phase 2's `qa_cards` + `public/graph/*.json`. Visitor UX is the goal.
