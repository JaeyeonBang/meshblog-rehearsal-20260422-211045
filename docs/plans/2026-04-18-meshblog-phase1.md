# meshblog Phase 1 — Harvest Pipeline 검증 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Volla의 entity extraction 로직(`graph.ts`)을 meshblog 환경(Astro+Node+SQLite, no Postgres, no Next.js, single-user)으로 이식하고, MD 3개 → SQLite entity 인덱스 파이프라인이 실제로 동작하는지 검증한다. 이 단계가 통과해야 Phase 2 (전체 RAG 이식 + Q&A 생성) 진입.

**Architecture:** 3-layer 단순 이식. (1) `db.ts`를 `pg` → `better-sqlite3` 변환, (2) `openrouter.ts`/`entity-extract.ts` 그대로 이식 (외부 HTTP), (3) `graph.ts`에서 `extractEntities`만 가져와 multi-tenant `user_id` 제거. CLI 스크립트(`scripts/build-index.ts`)가 `content/`의 MD를 읽어 entity 추출 → SQLite 저장. Astro/React는 이번 phase에서 건드리지 않음.

**Tech Stack:** Bun (runtime+test+pkg manager), TypeScript, better-sqlite3, OpenRouter (gpt-4o-mini), Vitest, gray-matter (frontmatter), dotenv.

**Phase 1 Scope Deviation from PRD §7:** PRD는 `graph.ts + concepts.ts` 2개를 명시했지만, `concepts.ts`는 `graph-topology.ts`(Louvain)에 의존하고 entity가 먼저 채워져야 의미 있음. Phase 1은 **`graph.ts`의 `extractEntities`만** 이식해 "MD → entity → SQLite"까지 검증. `concepts.ts` + `graph-topology.ts`는 Phase 2 초입으로 이관.

**Volla 출처 디렉토리:** `/mnt/d/projects/volla/web/src/lib/`

---

## Review Patches (2026-04-18 autoplan 합의)

CEO/Eng/DX 3-voice review 결과. 아래 5개 패치는 원본 task에 **override** 적용. 실행자는 각 task 시작 시 해당 patch 노트를 먼저 읽고 반영할 것.

### Patch A — Kill gates 명시 (T10)
Phase 1 끝 retro에 go/no-go 수치 기준. 아래 T10 Step 1 테이블에 구체 thresholds 반영됨 (원본 "?" → pass 조건 명시).

### Patch B — Runtime footgun 3종 선제 처리

- **B1 (T1 + T6):** `@/` tsconfig path alias **사용하지 않음**. 모든 import는 상대경로 (`../../lib/db`). T6 Step 5의 "동작 안하면 상대경로로"라는 갈림길 제거.
- **B2 (T4):** OpenRouter 요청에 `response_format: { type: "json_object" }` 추가. gpt-4o-mini가 markdown-wrapped JSON 반환하는 실패모드 제거. `graph.ts` 내 JSON 파싱 regex는 여전히 유지 (fallback).
- **B3 (T1 + T8):** `.env.local`을 명시적으로 로드. `import "dotenv/config"` (=`.env` 읽음) 대신 `import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });`. 또한 T1에 **`.env.example` 파일 생성** 추가 (포크하는 사람용).

### Patch C — Dopamine 조기화 + Astro 통합 검증

- **C1 신규 T2.5 (mocked smoke test):** T4(openrouter) 이식 전에 `callOpenRouter`를 hardcoded JSON 반환 stub으로 둔 채 MD→SQLite 전체 파이프라인을 먼저 한번 돌린다. 플럼빙 검증을 4시간 → 1시간으로 단축. 실제 LLM call은 T9에서 stub만 제거하면 됨.
- **C2 신규 T8.5 (Astro build 통합):** 최소 `src/pages/index.astro` 1장. build time에 SQLite에서 `entities` top-10을 읽어 `<ul>` 렌더. `astro build` 성공 + `dist/index.html`에 entity 이름 포함 확인. PRD §7이 약속한 "Astro + SQLite + RAG 조합 검증"의 실제 이행.

### Patch D — 테스트 의식 컷 + content_hash 실제 wiring

- **D1 (test cut):** 원본 17 tests → **3 tests**로 축소:
  1. End-to-end smoke (build-index 3 fixtures → counts > 0, graph_status='done')
  2. Zod schema robustness (malformed LLM payload → 정상화)
  3. Idempotency (build-index 2회 실행 → entities row count 동일, mention_count 2배)
  - 삭제: db wrapper 개별 테스트, openrouter env-guard, migrate 단독 테스트, normalizeName 단위 테스트 (smoke가 transitively 검증).
- **D2 (T8 content_hash skip):** `build-index.ts`에서 각 note에 대해 기존 row 조회 → `content_hash` 같으면 `extractEntities` 스킵 + 로그 `→ skipped (unchanged)`. PRD §6/Q3의 "incremental-ready" 약속 실제 이행. 5줄.

### Patch E — Forkability 최소셋

- **E1 (T1):** `.env.example` 커밋 (B3와 같이). 내용:
  ```
  OPENROUTER_API_KEY=sk-or-v1-...
  OPENROUTER_DEFAULT_MODEL=openai/gpt-4o-mini
  ```
- **E2 (T7 fixture 보강):** 기존 3개 + 다음 2개 추가:
  - `content/notes/philosophy-on-writing.md` — **vault prose 픽스처** (tech tutorial 아닌 본인 prose 짧은 글). taste 실패모드 조기 노출.
  - `content/_drafts/04-secret.md` — `public: false` frontmatter. T9 검증에서 **이 파일이 DB에 없어야** 함 (PRD §6/Q2 폴더+frontmatter 정책 실증).
  - 기존 fixture 중 하나에 `level_pin: 2` 추가 (PRD §6/Q5 frontmatter 스키마 선반영).
- **E3 (T10):** 10줄 최소 `README.md` + `bun run setup` (`.env.example` → `.env.local` 복사 + `mkdir -p .data`). forker가 명령어 2개로 착수 가능.

### 변경 요약 (task 수준)

- **신규 task 2개:** T2.5 (mocked smoke), T8.5 (Astro build)
- **수정 task:** T1 (deps + `.env.example` + setup script), T4 (response_format), T6 (상대경로), T7 (fixture 5개로 확대), T8 (dotenv 경로 + hash skip), T10 (kill gates + README 커밋)
- **삭제:** 개별 unit test 14개 (smoke+schema+idempotency 3개만 유지)
- **유지(Q1a/Q2a/Q3a 결정):** concepts.ts는 Phase 2. Quartz 대응 narrative는 Phase 5 design sprint. vault prose fixture는 1개 조기 추가(E2).

---

## Pre-conditions (실행자가 확인)

- Bun ≥ 1.1 설치 (`bun --version`)
- OpenRouter API key 보유. Phase 1 비용 추정: $0.01 미만 (3개 MD × gpt-4o-mini)
- 작업 디렉토리: `/mnt/d/projects/meshblog`
- Volla 레포 read-only 접근: `/mnt/d/projects/volla`

---

## Task 0: Git 초기화 + .gitignore

meshblog는 아직 git repo 아님. Phase 1 시작 전 init.

**Files:**
- Create: `/mnt/d/projects/meshblog/.gitignore` (이미 있을 수 있음 — 확인 후 보강)

**Step 1: 현재 상태 확인**

```bash
cd /mnt/d/projects/meshblog
test -d .git && echo "git exists" || echo "no git"
cat .gitignore 2>/dev/null || echo "no .gitignore"
```

**Step 2: git init (없을 경우)**

```bash
git init -b main
git config user.email "qkdwodus777@gmail.com"
git config user.name "Jaeyeon Bang"
```

**Step 3: .gitignore 보강**

기존 .gitignore에 다음 항목 누락 시 추가:

```gitignore
# meshblog phase 1 additions
.data/
node_modules/
dist/
.env.local
.env
*.log
```

**Step 4: 첫 커밋 (현재 scaffold 상태)**

```bash
git add -A
git commit -m "chore: initial scaffold + .gitignore"
```

---

## Task 1: 의존성 설치

**Files:**
- Modify: `/mnt/d/projects/meshblog/package.json`

**Step 1: 추가 패키지 설치**

```bash
cd /mnt/d/projects/meshblog
bun add better-sqlite3 zod gray-matter dotenv
bun add -d vitest @types/better-sqlite3 @types/node typescript
```

**Step 2: package.json 검증**

```bash
cat package.json
```

Expected: `dependencies`에 `better-sqlite3`, `zod`, `gray-matter`, `dotenv` 포함. `devDependencies`에 `vitest`, `@types/better-sqlite3` 포함.

**Step 3: scripts 섹션에 test/build-index 추가**

`package.json`의 `"scripts"` 객체에 추가:

```json
"test": "vitest run",
"test:watch": "vitest",
"build-index": "bun run scripts/build-index.ts"
```

**Step 4: tsconfig 확인**

```bash
cat tsconfig.json
```

Astro 기본이 strict하지 않을 수 있음. 다음 항목 확인 (없으면 추가):

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "types": ["node"]
  }
}
```

**Step 5: 커밋**

```bash
git add package.json bun.lock tsconfig.json
git commit -m "chore: add deps for phase 1 (sqlite, zod, vitest)"
```

---

## Task 2: SQLite 스키마 + 마이그레이션 스크립트

설계 문서 §6에서 결정: `content_hash` 컬럼은 처음부터 포함 (incremental rebuild 미래 확장용). `user_id` 컬럼 제거 (single-user).

**Files:**
- Create: `/mnt/d/projects/meshblog/src/lib/db/schema.sql`
- Create: `/mnt/d/projects/meshblog/src/lib/db/migrate.ts`

**Step 1: 실패 테스트 작성**

Create `/mnt/d/projects/meshblog/src/lib/db/__tests__/migrate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import { applyMigrations } from "../migrate"

describe("migrate", () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(":memory:")
  })

  it("creates notes, entities, note_entities, entity_relationships tables", () => {
    applyMigrations(db)
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain("notes")
    expect(names).toContain("entities")
    expect(names).toContain("note_entities")
    expect(names).toContain("entity_relationships")
  })

  it("notes table has content_hash column", () => {
    applyMigrations(db)
    const cols = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain("content_hash")
  })

  it("is idempotent (apply twice without error)", () => {
    applyMigrations(db)
    expect(() => applyMigrations(db)).not.toThrow()
  })
})
```

**Step 2: 테스트 실행 (실패 확인)**

```bash
bun run test src/lib/db/__tests__/migrate.test.ts
```

Expected: FAIL — `applyMigrations` not found.

**Step 3: 스키마 작성**

Create `/mnt/d/projects/meshblog/src/lib/db/schema.sql`:

```sql
-- meshblog Phase 1 schema (single-user, no user_id)
-- content_hash is included from day 1 to support future incremental rebuild.

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,         -- slug or stable id
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,            -- sha256 of content; for v2 incremental
  folder_path   TEXT NOT NULL DEFAULT '/',
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array
  graph_status  TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  mention_count   INTEGER NOT NULL DEFAULT 1,
  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, entity_type)
);

CREATE TABLE IF NOT EXISTS note_entities (
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, entity_id)
);

CREATE TABLE IF NOT EXISTS entity_relationships (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_entity_id    INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id    INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship        TEXT NOT NULL,
  confidence          REAL NOT NULL DEFAULT 0.5,
  source_type         TEXT NOT NULL DEFAULT 'INFERRED',
  UNIQUE(source_entity_id, target_entity_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_note_entities_entity ON note_entities(entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_hash ON notes(content_hash);
```

**Step 4: 마이그레이션 함수 구현**

Create `/mnt/d/projects/meshblog/src/lib/db/migrate.ts`:

```ts
import type Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export function applyMigrations(db: Database.Database): void {
  const schemaPath = join(__dirname, "schema.sql")
  const schema = readFileSync(schemaPath, "utf-8")
  db.exec(schema)
}
```

**Step 5: 테스트 통과 확인**

```bash
bun run test src/lib/db/__tests__/migrate.test.ts
```

Expected: PASS — 3 tests.

**Step 6: 커밋**

```bash
git add src/lib/db/
git commit -m "feat(db): SQLite schema + migrate (single-user, content_hash baked in)"
```

---

## Task 3: db.ts — better-sqlite3 wrapper

Volla의 `db.ts`는 pg pool 기반 async API (`queryOne/queryMany/execute`). better-sqlite3는 sync API. 인터페이스는 비슷하게 유지하되 sync로. 또한 PostgreSQL `$1, $2` placeholder를 SQLite `?` 로 변환은 호출부에서. (이식 시 SQL 자체를 SQLite 문법으로 다시 작성하므로, placeholder 자동 변환은 불필요.)

**Files:**
- Create: `/mnt/d/projects/meshblog/src/lib/db/index.ts`
- Create: `/mnt/d/projects/meshblog/src/lib/db/__tests__/index.test.ts`

**Step 1: 실패 테스트 작성**

Create `/mnt/d/projects/meshblog/src/lib/db/__tests__/index.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import { applyMigrations } from "../migrate"
import { createDb, queryOne, queryMany, execute } from "../index"

describe("db wrapper", () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(":memory:")
    applyMigrations(db)
  })

  it("execute inserts a row", () => {
    execute(db, "INSERT INTO entities (name, entity_type) VALUES (?, ?)", ["react", "technology"])
    const row = queryOne<{ name: string }>(db, "SELECT name FROM entities WHERE name = ?", ["react"])
    expect(row?.name).toBe("react")
  })

  it("queryMany returns array", () => {
    execute(db, "INSERT INTO entities (name, entity_type) VALUES (?, ?)", ["a", "concept"])
    execute(db, "INSERT INTO entities (name, entity_type) VALUES (?, ?)", ["b", "concept"])
    const rows = queryMany<{ name: string }>(db, "SELECT name FROM entities ORDER BY name", [])
    expect(rows.map(r => r.name)).toEqual(["a", "b"])
  })

  it("queryOne returns null when no row", () => {
    const row = queryOne(db, "SELECT 1 AS x WHERE 1=0", [])
    expect(row).toBeNull()
  })

  it("createDb opens file path and runs migrations", () => {
    const tmp = createDb(":memory:")
    const tables = tmp.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all()
    expect(tables.length).toBeGreaterThan(0)
    tmp.close()
  })
})
```

**Step 2: 테스트 실행 (실패)**

```bash
bun run test src/lib/db/__tests__/index.test.ts
```

Expected: FAIL.

**Step 3: 구현**

Create `/mnt/d/projects/meshblog/src/lib/db/index.ts`:

```ts
import Database from "better-sqlite3"
import { applyMigrations } from "./migrate"

export function createDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  applyMigrations(db)
  return db
}

export function queryOne<T = Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  params: unknown[],
): T | null {
  const stmt = db.prepare(sql)
  return (stmt.get(...params) as T) ?? null
}

export function queryMany<T = Record<string, unknown>>(
  db: Database.Database,
  sql: string,
  params: unknown[],
): T[] {
  const stmt = db.prepare(sql)
  return stmt.all(...params) as T[]
}

export function execute(
  db: Database.Database,
  sql: string,
  params: unknown[],
): { changes: number; lastInsertRowid: number | bigint } {
  const stmt = db.prepare(sql)
  return stmt.run(...params)
}

export type { Database }
```

**Step 4: 테스트 통과 확인**

```bash
bun run test src/lib/db/
```

Expected: PASS — 7 tests total (migrate 3 + index 4).

**Step 5: 커밋**

```bash
git add src/lib/db/
git commit -m "feat(db): better-sqlite3 wrapper (sync API, queryOne/Many/execute)"
```

---

## Task 4: openrouter.ts 이식 (최소 subset)

Volla의 `openrouter.ts` 96 lines 중 SSE streaming 등은 Phase 1 불필요. `callOpenRouter` + `ChatMessage` 타입만.

**Files:**
- Create: `/mnt/d/projects/meshblog/src/lib/llm/openrouter.ts`

**Step 1: 원본 참조**

```bash
cat /mnt/d/projects/volla/web/src/lib/llm/openrouter.ts | head -60
```

**Step 2: 최소 이식 작성**

Create `/mnt/d/projects/meshblog/src/lib/llm/openrouter.ts`:

```ts
export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type OpenRouterOptions = {
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
  temperature?: number
}

export async function callOpenRouter(options: OpenRouterOptions): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set in environment")
  }

  const {
    messages,
    model = process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini",
    maxTokens = 2000,
    temperature = 0.7,
  } = options

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/JaeyeonBang/meshblog",
      "X-Title": "meshblog",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter ${response.status}: ${text}`)
  }

  return response
}
```

**Step 3: 환경변수 가드 단위 테스트**

Create `/mnt/d/projects/meshblog/src/lib/llm/__tests__/openrouter.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest"
import { callOpenRouter } from "../openrouter"

describe("callOpenRouter env guard", () => {
  const original = process.env.OPENROUTER_API_KEY

  afterEach(() => {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = original
  })

  it("throws when OPENROUTER_API_KEY missing", async () => {
    delete process.env.OPENROUTER_API_KEY
    await expect(
      callOpenRouter({ messages: [{ role: "user", content: "hi" }] })
    ).rejects.toThrow(/OPENROUTER_API_KEY not set/)
  })
})
```

**Step 4: 테스트 통과 확인**

```bash
bun run test src/lib/llm/
```

Expected: PASS.

**Step 5: 커밋**

```bash
git add src/lib/llm/
git commit -m "feat(llm): port openrouter.ts (phase 1 minimal subset, no streaming)"
```

---

## Task 5: entity-extract 프롬프트 이식

Volla 원본을 거의 그대로. `ChatMessage` import 경로만 바꿈.

**Files:**
- Create: `/mnt/d/projects/meshblog/src/lib/llm/prompts/entity-extract.ts`

**Step 1: 이식**

Create `/mnt/d/projects/meshblog/src/lib/llm/prompts/entity-extract.ts`:

```ts
import type { ChatMessage } from "../openrouter"

const ENTITY_TYPES = ["person", "technology", "project", "concept", "organization", "other"] as const

const SYSTEM_PROMPT = `You are an entity extraction system. Extract entities and relationships from the given note content.

Return a JSON object with this exact structure:
{
  "entities": [
    { "name": "Entity Name", "type": "technology", "description": "Brief description" }
  ],
  "relationships": [
    { "source": "Entity A", "target": "Entity B", "relationship": "used_in" }
  ]
}

Rules:
- Entity types must be one of: ${ENTITY_TYPES.join(", ")}
- Use canonical names (e.g., "Next.js" not "nextjs", "React" not "react.js")
- Only extract entities that are explicitly mentioned in the text
- Keep descriptions under 50 characters
- Relationships should describe how entities relate (e.g., "used_in", "created_by", "part_of", "related_to")
- Return at most 10 entities and 10 relationships
- If the note has no extractable entities, return {"entities": [], "relationships": []}
- Return ONLY the JSON object, no markdown or explanation`

export function buildEntityExtractionPrompt(noteContent: string): ChatMessage[] {
  const cleaned = noteContent
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: cleaned || "Empty note" },
  ]
}

export { ENTITY_TYPES }
```

**Step 2: 단위 테스트 (입력 sanitize)**

Create `/mnt/d/projects/meshblog/src/lib/llm/prompts/__tests__/entity-extract.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildEntityExtractionPrompt, ENTITY_TYPES } from "../entity-extract"

describe("buildEntityExtractionPrompt", () => {
  it("returns system + user messages", () => {
    const msgs = buildEntityExtractionPrompt("hello")
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe("system")
    expect(msgs[1].role).toBe("user")
    expect(msgs[1].content).toBe("hello")
  })

  it("strips HTML tags", () => {
    const msgs = buildEntityExtractionPrompt("<p>react is cool</p>")
    expect(msgs[1].content).toBe("react is cool")
  })

  it("collapses whitespace", () => {
    const msgs = buildEntityExtractionPrompt("a\n\n\nb")
    expect(msgs[1].content).toBe("a b")
  })

  it("caps at 8000 chars", () => {
    const huge = "x".repeat(10000)
    const msgs = buildEntityExtractionPrompt(huge)
    expect(msgs[1].content.length).toBe(8000)
  })

  it("falls back to 'Empty note' for blank input", () => {
    const msgs = buildEntityExtractionPrompt("   ")
    expect(msgs[1].content).toBe("Empty note")
  })

  it("ENTITY_TYPES matches Volla", () => {
    expect(ENTITY_TYPES).toEqual([
      "person", "technology", "project", "concept", "organization", "other"
    ])
  })
})
```

**Step 3: 테스트 통과 확인**

```bash
bun run test src/lib/llm/
```

Expected: PASS — 7 tests (1 openrouter + 6 entity-extract).

**Step 4: 커밋**

```bash
git add src/lib/llm/prompts/
git commit -m "feat(llm): port entity-extract prompt"
```

---

## Task 6: graph.ts → extractEntities 이식 (single-user, SQLite)

Volla 원본 340 lines 중 Phase 1 필요한 것은 `extractEntities`만. 변경:
- `user_id` 파라미터/컬럼 모두 제거
- `pg` placeholder `$1` → `?`
- `db` instance를 함수 첫 인자로 (sync API)
- `notes.graph_status` 업데이트는 유지
- `entity_relationships` UPSERT는 SQLite 문법으로 (`ON CONFLICT ... DO UPDATE`)

**Files:**
- Create: `/mnt/d/projects/meshblog/src/lib/rag/graph.ts`
- Create: `/mnt/d/projects/meshblog/src/lib/rag/__tests__/graph.test.ts`

**Step 1: 원본 참조 (extractEntities 부분)**

```bash
sed -n '1,55p;187,212p' /mnt/d/projects/volla/web/src/lib/rag/graph.ts
```

(Lines 1-55: imports + schema + helpers. Lines 56-185: extractEntities. Lines 187-211: buildNoteLinks — Phase 1 skip.)

**Step 2: 정규화/검증 헬퍼 단위 테스트 (LLM 호출 없음)**

Create `/mnt/d/projects/meshblog/src/lib/rag/__tests__/graph.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { normalizeName, sanitizeText, extractionResultSchema } from "../graph"

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  React  ")).toBe("react")
  })

  it("applies canonical aliases", () => {
    expect(normalizeName("Next.js")).toBe("nextjs")
    expect(normalizeName("postgres")).toBe("postgresql")
    expect(normalizeName("TS")).toBe("typescript")
  })

  it("strips HTML", () => {
    expect(normalizeName("<b>react</b>")).toBe("react")
  })
})

describe("sanitizeText", () => {
  it("strips HTML and trims to 200 chars", () => {
    const input = "<p>" + "x".repeat(300) + "</p>"
    const out = sanitizeText(input)
    expect(out.length).toBe(200)
    expect(out).not.toContain("<")
  })
})

describe("extractionResultSchema", () => {
  it("parses valid LLM output", () => {
    const data = {
      entities: [{ name: "React", type: "technology", description: "UI lib" }],
      relationships: [{ source: "React", target: "JS", relationship: "uses" }],
    }
    const parsed = extractionResultSchema.parse(data)
    expect(parsed.entities).toHaveLength(1)
  })

  it("defaults missing arrays to []", () => {
    const parsed = extractionResultSchema.parse({})
    expect(parsed.entities).toEqual([])
    expect(parsed.relationships).toEqual([])
  })

  it("coerces unknown entity type to 'other'", () => {
    const parsed = extractionResultSchema.parse({
      entities: [{ name: "X", type: "unknown_type", description: "" }],
    })
    expect(parsed.entities[0].type).toBe("other")
  })
})
```

**Step 3: 실패 확인**

```bash
bun run test src/lib/rag/
```

Expected: FAIL — module not found.

**Step 4: graph.ts 작성**

Create `/mnt/d/projects/meshblog/src/lib/rag/graph.ts`:

```ts
import { z } from "zod"
import { queryOne, execute, type Database } from "@/lib/db"
import { callOpenRouter } from "@/lib/llm/openrouter"
import { buildEntityExtractionPrompt, ENTITY_TYPES } from "@/lib/llm/prompts/entity-extract"

// --- Schema validation for LLM output ---

const entitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(ENTITY_TYPES).catch("other"),
  description: z.string().default(""),
})

export const extractionResultSchema = z.object({
  entities: z.array(entitySchema).max(10).default([]),
  relationships: z.array(z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    relationship: z.string().min(1),
  })).max(10).default([]),
})

export type ExtractionResult = z.infer<typeof extractionResultSchema>

// --- Normalization (verbatim from Volla) ---

const CANONICAL_ALIASES: Record<string, string> = {
  "react.js": "react", "reactjs": "react", "react js": "react",
  "next.js": "nextjs", "next js": "nextjs",
  "node.js": "nodejs", "node js": "nodejs",
  "vue.js": "vue", "vuejs": "vue",
  "nuxt.js": "nuxt", "express.js": "express", "expressjs": "express",
  "nest.js": "nestjs", "svelte.js": "svelte",
  "mongo db": "mongodb", "mongo": "mongodb",
  "pg": "postgresql", "postgres": "postgresql",
  "ts": "typescript", "js": "javascript",
  "py": "python", "python3": "python",
  "golang": "go",
  "tailwind css": "tailwindcss", "tailwind": "tailwindcss",
  "gpt4": "gpt-4", "gpt4o": "gpt-4o", "gpt-4o mini": "gpt-4o-mini", "gpt4o-mini": "gpt-4o-mini",
  "rest api": "rest", "restful api": "rest", "graphql api": "graphql",
  "github actions": "github-actions", "gh actions": "github-actions",
}

export function normalizeName(name: string): string {
  const cleaned = name.replace(/<[^>]*>/g, "").trim().toLowerCase()
  return CANONICAL_ALIASES[cleaned] ?? cleaned
}

export function sanitizeText(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim().slice(0, 200)
}

// --- Entity Extraction (single-user, SQLite, sync db) ---

export async function extractEntities(
  db: Database.Database,
  noteId: string,
  noteContent: string,
  maxRetries = 2,
): Promise<ExtractionResult> {
  execute(db, "UPDATE notes SET graph_status = 'pending' WHERE id = ?", [noteId])

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }

      const messages = buildEntityExtractionPrompt(noteContent)
      const response = await callOpenRouter({
        messages,
        model: "openai/gpt-4o-mini",
        maxTokens: 1500,
        temperature: 0.3,
      })

      const json = await response.json()
      const content = json.choices?.[0]?.message?.content ?? ""

      const jsonStr = content.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "").trim()
      const parsed = JSON.parse(jsonStr)
      const result = extractionResultSchema.parse(parsed)

      const normalizedEntities = result.entities.map((e) => ({
        ...e,
        name: normalizeName(e.name),
        description: sanitizeText(e.description),
      })).filter((e) => e.name.length > 0)

      const normalizedRelationships = result.relationships.map((r) => ({
        source: normalizeName(r.source),
        target: normalizeName(r.target),
        relationship: sanitizeText(r.relationship),
      }))

      // UPSERT entities
      for (const entity of normalizedEntities) {
        const existing = queryOne<{ id: number; mention_count: number }>(
          db,
          "SELECT id, mention_count FROM entities WHERE name = ? AND entity_type = ?",
          [entity.name, entity.type],
        )

        let entityId: number

        if (existing) {
          execute(
            db,
            "UPDATE entities SET description = COALESCE(NULLIF(?, ''), description), last_seen_at = datetime('now'), mention_count = ? WHERE id = ?",
            [entity.description, existing.mention_count + 1, existing.id],
          )
          entityId = existing.id
        } else {
          const result = execute(
            db,
            "INSERT INTO entities (name, entity_type, description) VALUES (?, ?, ?)",
            [entity.name, entity.type, entity.description],
          )
          entityId = Number(result.lastInsertRowid)
        }

        execute(
          db,
          "INSERT OR IGNORE INTO note_entities (note_id, entity_id) VALUES (?, ?)",
          [noteId, entityId],
        )
      }

      // UPSERT entity_relationships
      for (const rel of normalizedRelationships) {
        const sourceEntity = queryOne<{ id: number }>(
          db,
          "SELECT id FROM entities WHERE name = ?",
          [rel.source],
        )
        const targetEntity = queryOne<{ id: number }>(
          db,
          "SELECT id FROM entities WHERE name = ?",
          [rel.target],
        )

        if (sourceEntity && targetEntity) {
          execute(
            db,
            `INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship, confidence, source_type)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (source_entity_id, target_entity_id, relationship)
             DO UPDATE SET confidence = MAX(entity_relationships.confidence, excluded.confidence),
                           source_type = CASE WHEN excluded.confidence > entity_relationships.confidence
                                              THEN excluded.source_type
                                              ELSE entity_relationships.source_type END`,
            [sourceEntity.id, targetEntity.id, rel.relationship, 0.7, "INFERRED"],
          )
        }
      }

      execute(db, "UPDATE notes SET graph_status = 'done' WHERE id = ?", [noteId])

      return { entities: normalizedEntities, relationships: normalizedRelationships }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[graph] attempt ${attempt + 1} failed:`, lastError.message)
    }
  }

  execute(db, "UPDATE notes SET graph_status = 'failed' WHERE id = ?", [noteId])
  console.error("[graph] entity extraction failed after retries:", lastError?.message)
  return { entities: [], relationships: [] }
}
```

**Step 5: tsconfig path alias 확인**

`@/lib/...` import가 동작하려면 `tsconfig.json`에 paths 설정 필요:

```json
"compilerOptions": {
  "baseUrl": ".",
  "paths": {
    "@/*": ["src/*"]
  }
}
```

Bun runtime이 tsconfig paths를 알아서 풀어주는지 확인:

```bash
bun run -e 'import("@/lib/db").then(m => console.log(Object.keys(m)))'
```

만약 풀리지 않으면 `bunfig.toml`에 다음 추가:

```toml
[install]
# Bun reads tsconfig paths by default; no extra config needed in modern bun.
```

또는 path alias를 쓰지 않고 상대 경로(`../../lib/db`)로 변경.

**Step 6: 단위 테스트 통과 확인**

```bash
bun run test src/lib/rag/
```

Expected: PASS — 7 tests (normalize 3 + sanitize 1 + schema 3).

**Step 7: 커밋**

```bash
git add src/lib/rag/ tsconfig.json
git commit -m "feat(rag): port extractEntities (single-user, SQLite, sync db)"
```

---

## Task 7: 샘플 MD 픽스처 3개 작성

**Files:**
- Create: `/mnt/d/projects/meshblog/content/posts/01-react-hooks.md`
- Create: `/mnt/d/projects/meshblog/content/posts/02-nextjs-rsc.md`
- Create: `/mnt/d/projects/meshblog/content/notes/03-prisma-vs-drizzle.md`

**Step 1: posts/01-react-hooks.md**

```markdown
---
title: "React Hooks 입문"
date: 2026-04-18
tags: [react, javascript, frontend]
---

# React Hooks 입문

React 16.8부터 도입된 Hooks는 함수 컴포넌트에서 상태와 라이프사이클을 다룰 수 있게 해준다.

대표적인 Hook:
- `useState` — 상태 관리
- `useEffect` — 사이드 이펙트 (마운트/언마운트, 외부 API 호출)
- `useMemo` — 비싼 계산 캐싱
- `useCallback` — 함수 메모이제이션

이전에는 클래스 컴포넌트로만 가능했던 것들이 함수형으로 깔끔하게 표현된다.
TypeScript와 함께 쓰면 타입 추론이 잘 된다.
```

**Step 2: posts/02-nextjs-rsc.md**

```markdown
---
title: "Next.js App Router와 RSC"
date: 2026-04-18
tags: [nextjs, react, server-components]
---

# Next.js App Router와 RSC

Next.js 13부터 도입된 App Router는 React Server Components(RSC)를 1급 시민으로 다룬다.
서버에서 데이터 패칭과 렌더링을 끝내고, 클라이언트로는 최소한의 JS만 보낸다.

장점:
- Bundle size 감소
- DB/API 호출을 서버에서 직접 (Prisma, Drizzle 등 ORM과 자연스러움)
- React 18의 Suspense + streaming SSR 활용

단점:
- 멘탈 모델이 클라이언트/서버 경계로 이중화됨
- "use client" 지시문을 잘못 두면 hydration mismatch 발생
```

**Step 3: notes/03-prisma-vs-drizzle.md**

```markdown
---
title: "Prisma vs Drizzle"
date: 2026-04-18
tags: [orm, database, typescript]
---

# Prisma vs Drizzle 비교

Prisma는 schema-first ORM. Schema 파일을 따로 두고 generate 명령으로 타입 생성.
Drizzle은 TypeScript-first ORM. Schema를 .ts 파일로 정의하면 타입이 바로 따라옴.

| | Prisma | Drizzle |
|---|---|---|
| Schema | .prisma DSL | .ts 파일 |
| Generate step | 필수 | 불필요 |
| Edge runtime | 제한적 | 잘 됨 |
| Migration | 자동 + manual | 자동 + manual |

PostgreSQL, MySQL, SQLite 모두 지원. 최근 Vercel/Cloudflare edge 환경에서는 Drizzle 선호도 증가.
```

**Step 4: 커밋**

```bash
git add content/
git commit -m "test(content): add 3 sample MD fixtures for phase 1 validation"
```

---

## Task 8: build-index.ts CLI 스크립트

`content/posts/` + `content/notes/`의 모든 MD를 읽어 → frontmatter 파싱 → SQLite에 notes row insert → `extractEntities` 호출.

**Files:**
- Create: `/mnt/d/projects/meshblog/scripts/build-index.ts`

**Step 1: 작성**

Create `/mnt/d/projects/meshblog/scripts/build-index.ts`:

```ts
import "dotenv/config"
import { readdirSync, readFileSync } from "node:fs"
import { join, basename, extname } from "node:path"
import { createHash } from "node:crypto"
import matter from "gray-matter"
import { createDb, execute } from "@/lib/db"
import { extractEntities } from "@/lib/rag/graph"

const DB_PATH = process.env.MESHBLOG_DB ?? ".data/index.db"
const CONTENT_DIRS = ["content/posts", "content/notes"]

function discoverMarkdown(): { path: string; folder: string }[] {
  const found: { path: string; folder: string }[] = []
  for (const dir of CONTENT_DIRS) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.startsWith("_") || !name.endsWith(".md")) continue
      found.push({ path: join(dir, name), folder: dir })
    }
  }
  return found
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

async function main() {
  console.log(`[build-index] DB: ${DB_PATH}`)
  const db = createDb(DB_PATH)

  const files = discoverMarkdown()
  console.log(`[build-index] found ${files.length} markdown files`)

  let processed = 0
  for (const { path, folder } of files) {
    const raw = readFileSync(path, "utf-8")
    const { data: fm, content } = matter(raw)
    const slug = basename(path, extname(path))
    const id = slug
    const title = (fm.title as string) ?? slug
    const tags = JSON.stringify(fm.tags ?? [])
    const hash = sha256(content)

    execute(
      db,
      `INSERT INTO notes (id, slug, title, content, content_hash, folder_path, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         content_hash = excluded.content_hash,
         folder_path = excluded.folder_path,
         tags = excluded.tags,
         updated_at = datetime('now')`,
      [id, slug, title, content, hash, folder, tags],
    )

    console.log(`[build-index] (${++processed}/${files.length}) extracting entities for "${title}"`)
    const result = await extractEntities(db, id, content)
    console.log(`  → ${result.entities.length} entities, ${result.relationships.length} relationships`)
  }

  // Summary
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM notes) AS notes,
      (SELECT COUNT(*) FROM entities) AS entities,
      (SELECT COUNT(*) FROM note_entities) AS note_entities,
      (SELECT COUNT(*) FROM entity_relationships) AS relationships
  `).get()

  console.log(`[build-index] done. counts:`, counts)
  db.close()
}

main().catch((err) => {
  console.error("[build-index] FATAL:", err)
  process.exit(1)
})
```

**Step 2: 사전 점검**

```bash
mkdir -p .data
ls .env.local 2>/dev/null || echo "ENV needed: copy from below"
```

**Step 3: .env.local 작성** (실행자가 직접)

`.env.local` 생성:

```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_DEFAULT_MODEL=openai/gpt-4o-mini
```

**Step 4: 커밋 (스크립트만, .env.local 제외)**

```bash
git add scripts/build-index.ts
git commit -m "feat(scripts): build-index CLI (MD → SQLite → extractEntities)"
```

---

## Task 9: End-to-end smoke test (실제 OpenRouter 호출)

**Files:**
- Run: `bun run build-index`

**Step 1: 빈 DB로 실행**

```bash
rm -f .data/index.db
bun run build-index
```

Expected output (대략):

```
[build-index] DB: .data/index.db
[build-index] found 3 markdown files
[build-index] (1/3) extracting entities for "React Hooks 입문"
  → 5 entities, 3 relationships
[build-index] (2/3) extracting entities for "Next.js App Router와 RSC"
  → 6 entities, 4 relationships
[build-index] (3/3) extracting entities for "Prisma vs Drizzle"
  → 4 entities, 2 relationships
[build-index] done. counts: { notes: 3, entities: 12, note_entities: 15, relationships: 9 }
```

(정확한 숫자는 LLM 응답에 따라 다름)

**Step 2: SQLite 검증 쿼리**

```bash
bun run -e '
import Database from "better-sqlite3"
const db = new Database(".data/index.db")
console.log("=== notes ===")
console.log(db.prepare("SELECT id, title, graph_status FROM notes").all())
console.log("=== top entities ===")
console.log(db.prepare("SELECT name, entity_type, mention_count FROM entities ORDER BY mention_count DESC LIMIT 10").all())
console.log("=== sample relationships ===")
console.log(db.prepare(`
  SELECT s.name AS source, t.name AS target, r.relationship
  FROM entity_relationships r
  JOIN entities s ON s.id = r.source_entity_id
  JOIN entities t ON t.id = r.target_entity_id
  LIMIT 10
`).all())
'
```

**Step 3: 검증 체크리스트**

- [ ] notes 테이블에 row 3개, 모두 `graph_status = 'done'`
- [ ] entities에 "react", "nextjs", "typescript" 등 정규화된 이름 등장 (CANONICAL_ALIASES 동작 확인)
- [ ] note_entities에 1개 이상의 link
- [ ] entity_relationships에 1개 이상의 row
- [ ] LLM 비용: OpenRouter 대시보드에서 < $0.01 확인

**Step 4: 재실행 멱등성 확인**

```bash
bun run build-index
```

Expected: 같은 노트지만 mention_count 증가, entities row 수는 거의 동일 (LLM 비결정성으로 ±1~2 가능). 에러 없이 완료.

**Step 5: 결과 캡처**

```bash
bun run -e '
import Database from "better-sqlite3"
const db = new Database(".data/index.db")
const counts = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM notes) AS notes,
    (SELECT COUNT(*) FROM entities) AS entities,
    (SELECT COUNT(*) FROM note_entities) AS note_entities,
    (SELECT COUNT(*) FROM entity_relationships) AS relationships
`).get()
console.log(JSON.stringify(counts, null, 2))
' > docs/plans/phase1-smoke-result.json
```

```bash
git add docs/plans/phase1-smoke-result.json
git commit -m "test(phase1): capture smoke test result"
```

---

## Task 10: Phase 1 회고 + Phase 2 진입 결정

**Files:**
- Create: `/mnt/d/projects/meshblog/docs/plans/phase1-retro.md`

**Step 1: 회고 문서 작성**

PRD §7 Phase 1 통과 기준을 line-by-line 검증:

아래는 명시 kill gate. 하나라도 FAIL이면 Phase 2 진입 보류 + 원인 분석.

| Criterion | Threshold | Pass / Fail | Evidence |
|---|---|---|---|
| Volla `lib/rag/graph.ts` 이식 (extractEntities) | 3 tests PASS (smoke+schema+idempotency) | ? | `bun run test` 출력 |
| MD 5개 → SQLite 인덱스 생성 동작 | 모든 published note `graph_status='done'`, `_drafts/` 파일은 row 없음 | ? | `phase1-smoke-result.json` |
| **Astro build + SQLite 통합 검증 (Patch C2)** | `astro build` 종료코드 0, `dist/index.html`에 entity 이름 1개 이상 포함 | ? | `dist/` artifact |
| 비용 / 노트 | < $0.01 per note (총 < $0.05 / 5 notes) | ? | `build-index` 출력의 `[cost] $X.XXXX` 라인 |
| LLM JSON 파싱 실패율 | < 20% (즉 5 노트 중 retry 1회 이내) | ? | `build-index` 로그 retry 횟수 |
| Entity recall (taste check) | vault prose 픽스처(`philosophy-on-writing.md`)에서 entity ≥ 3개, 그 중 사람이 읽었을 때 "맞는" entity 비율 ≥ 60% | ? | retro에 entity 리스트 첨부 + 본인 평가 |
| content_hash skip 동작 (Patch D2) | 2회차 build에서 5/5 노트 skipped | ? | `build-index` 로그 |

**Step 2: 발견된 이슈 / 적응 비용 기록**

다음을 메모:
- bun + tsconfig path alias 동작 여부
- LLM JSON 파싱 실패율 (재시도 발생했는지)
- Volla SQL → SQLite 문법 변환에서 막힌 부분
- `concepts.ts` Phase 2 이관에 대한 메모 (graph-topology.ts 의존 처리 방안)

**Step 3: Phase 2 plan 트리거 결정**

- All criteria PASS → "Phase 2 plan 작성으로 진행"
- 1개라도 FAIL → 원인 분석 후 PRD/설계 재검토 후 결정

**Step 4: 커밋**

```bash
git add docs/plans/phase1-retro.md
git commit -m "docs(phase1): retro + go/no-go decision"
```

---

## Done Criteria for Phase 1

- [ ] Tasks 0~10 완료 (T2.5, T8.5 신규 포함, 총 13 tasks)
- [ ] `bun run test` 전체 PASS (3 tests: smoke + schema + idempotency)
- [ ] `bun run build-index` 무에러 + 5 notes 처리 + cost 라인 출력
- [ ] `astro build` 무에러 + `dist/index.html`에 entity 렌더링
- [ ] `_drafts/04-secret.md`가 SQLite에 없음을 검증 (Patch E2)
- [ ] `.env.example` + `README.md` 커밋 (Patch E1, E3)
- [ ] `phase1-retro.md` 작성 + 7개 kill gate 모두 PASS 표시
- [ ] git history 정돈 (각 task 별 commit)

---

## Reference

- PRD: `docs/plans/2026-04-18-meshblog-prd.md`
- Origin design: `~/.gstack/projects/JaeyeonBang-volla/qkdwodus777-develop-design-20260416-meshblog-pivot.md`
- Volla source: `/mnt/d/projects/volla/web/src/lib/rag/graph.ts` (extractEntities)
- Volla schema (참고용, postgres): `/mnt/d/projects/volla/web/src/migrations/`
