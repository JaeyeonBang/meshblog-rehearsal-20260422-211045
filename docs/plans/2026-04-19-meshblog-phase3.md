<!-- /autoplan restore point: ~/.gstack/projects/meshblog/main-autoplan-restore-20260419-002220.md -->
# meshblog Phase 3 — 방문자 UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Phase 2에서 생성된 SQLite(`qa_cards`, `concepts`, `note_embeddings`)와 `public/graph/*.json` 6종을 소비하여 방문자가 실제로 쓸 수 있는 정적 사이트를 구축한다. 산출물: (1) Astro 4페이지 (`index`, `posts/[slug]`, `notes/[slug]`, `graph`), (2) React 4-island (`MarkdownView`, `QAChips`, `GraphView`, `BrainPreview`), (3) Fuse.js 기반 homepage + 페이지 단위 Q&A 검색, (4) d3-force 노트/개념 그래프 + L1~3 토글. 21 fixture 노트 기준 `bun run build` 후 `dist/` 내 모든 페이지가 렌더되고 graph 페이지에서 3-level 토글 + mode 스위치가 동작하면 Phase 3 종료.

**Architecture:** Astro 6 static-only. 각 페이지는 build time에 `better-sqlite3`로 SQLite을 readonly로 열어 frontmatter에 필요한 데이터(QA rows, 연결된 entity, 인접 note)를 주입한다. React 컴포넌트는 **island pattern** (`@astrojs/react`) — Astro는 SSR HTML만 뽑고 React는 hydration 시 props 받음. graph JSON은 `public/graph/*.json`에 이미 존재 → island가 `fetch('/graph/note-l2.json')`로 런타임 로드. DB 접근은 **build time만**, 런타임에 SQLite 미접근.

**Tech Stack:** 기존 (Astro 6.1.7, better-sqlite3, TypeScript, vitest, tsx) + 추가:
- `@astrojs/react` — Astro integration
- `react` / `react-dom` 19 — island runtime
- `react-markdown` + `remark-gfm` + `rehype-raw` — 본문 렌더
- `fuse.js` — fuzzy 검색 (client-side)
- `d3-force` + `d3-selection` + `d3-zoom` + `d3-drag` — graph 시각화 (Volla 그대로 차용)

**Explicit drop (Phase 5로 미룸):**
- Tailwind tokens / 디자인 시스템 (Phase 5)
- 타이포그래피, 컬러, spacing scale (Phase 5)
- `og:*`, `twitter:card`, sitemap.xml 깊이 (Phase 5)
- 애니메이션 / transition / skeleton loading (Phase 5)
- 댓글, 좋아요, 조회수 (PRD §4 non-goal)
- CC skills 연결 (Phase 4)
- gh-pages workflow (Phase 4)
- `/ask` 런타임 RAG (Phase 4, `lib/rag/pipeline.ts` 이식만 되어있음)
- entity wiki 페이지 (`/wiki/[entity]`) — Phase 2 Open Q #5에서 Phase 3로 넘겼지만 **이번 phase에선 MarkdownView에서 link만 걸고 실제 wiki 페이지는 Phase 4로 재이관**. 이유: 이번 phase scope 이미 큼.

**Phase 2 산출물 재확인 (Pre-condition):**
- `content/posts/` 2개, `content/notes/` 21개 = 23 published MD
- `.data/index.db` 9 테이블, `qa_cards` tier=note/concept/global row 존재 (live dry-run 시)
- `public/graph/{note,concept}-l{1,2,3}.json` 6개 존재 확인됨
- `notes.level_pin`, `notes.graph_status` 컬럼 존재

---

## Review Patches (자체 pre-review, 본인 결정 기반)

Phase 2 retro의 lessons learned 7가지 + Phase 3 특유 visitor UX 결정 세트. 실행자는 각 task 착수 시 해당 patch 먼저 읽을 것.

### Patch A — Slug / 라우팅 / 공개 정책 일괄 결정 선행

PRD §4에는 "posts/ = 빌드, notes/ = 빌드, _drafts/ = 무시" 만 있고 라우팅 세부는 없음. 구현자가 task별로 결정하면 불일치 생김. 선결.

- **A1 (slug 규칙):** notes/posts 모두 **파일 basename을 그대로 slug로 쓴다.** 한글 basename도 그대로 (`philosophy-on-writing.md` → `/notes/philosophy-on-writing`, `01-글쓰기-패턴.md` → `/notes/01-글쓰기-패턴`). 이유:
  - Phase 1 `build-index.ts`가 이미 `notes.slug = basename(file, ".md")` 로 저장함 → DB와 일치
  - Astro의 `getStaticPaths()`는 URL-encoded non-ASCII slug를 자동 처리 (`encodeURIComponent` 내장)
  - frontmatter에 `slug:` 오버라이드는 **지원 안 함** (Phase 5에서 필요 시 검토)
  - **주의:** URL bar에 한글이 퍼센트 인코딩되어 보임 ... 브라우저 대부분 자동 디코딩. 공유 시 `%EA%B8%80...` 로 카피될 수 있음. 이는 알려진 trade-off, Phase 3에서 수용.

- **A2 (posts vs notes 구분):** 폴더 경로가 유일한 구분자. 추가 frontmatter 마커 (`type: post`) **도입 안 함**. 이유:
  - PRD §4에서 이미 "posts/, notes/" 폴더 기반 결정
  - DB에는 `notes.folder_path` 컬럼이 이미 있음 (값: `"/posts"` 또는 `"/notes"`)
  - 라우팅: `folder_path='/posts'` → `/posts/[slug]`, 나머지 → `/notes/[slug]`
  - 현재 fixture: posts 2개 (`01-react-hooks.md`, `02-nextjs-rsc.md`), notes 21개. posts는 "공개용 blog post", notes는 "atomic KM 노트" 로 역할 분리. posts는 tag + date 노출 + 홈 feed에 노출, notes는 그래프 노드 + FAQ 검색에서만 노출.

- **A3 (`public: false` override):** Phase 1 `build-index.ts`는 frontmatter에 `public: false`가 있으면 skip한다고 PRD §6 Q2에 명시. **현재 구현 확인 필요** (Phase 2 task 목록에는 없음). Phase 3 Task 0에서 grep으로 검증: `grep -n "public" src/lib/rag/graph.ts scripts/build-index.ts`. 미구현이면 Phase 3 scope에서 **드랍** (별도 이슈로 Phase 4). 이유: 현 fixture 모두 `public: false` 없음, blocker 아님.

- **A4 (`_drafts/` 폴더):** Phase 1 `build-index.ts`에서 이미 skip 중 (확인됨, `content/_drafts/` dir 존재하지만 MD 없음). Phase 3는 이 폴더를 **전혀 읽지 않음**. Astro `getStaticPaths()`의 DB query에서 `folder_path NOT LIKE '/_drafts%'` 절 불필요 (DB에 row 자체 없음).

- **A5 (없는 slug 404):** 존재하지 않는 `/notes/foo` 접근 시 Astro static 기본 동작 = 404. 커스텀 404 페이지 **추가 안 함** (Phase 5). 기본 동작으로 충분.

### Patch B — React island hydration / 의존성 최소화

Volla의 `knowledge-graph.tsx`는 684 lines에 d3 서브패키지 4개 + complex panel state. 그대로 이식하면 bundle 초과 + 설계 충돌. Phase 3 범위에서 **slim port** 원칙.

- **B1 (Hydration 전략):** 각 island별로 client directive를 의도적으로 다르게 씀.

  | Island | Directive | 이유 |
  |---|---|---|
  | `MarkdownView` | `client:load` | 본문은 LCP, 즉시 interactive 필요 없음. 하지만 rehype heading-anchor 등 JS 필요하면 hydration 필수. Volla 패턴 그대로. |
  | `QAChips` | `client:visible` | fold 이하일 수 있음. 검색 상호작용은 viewport 진입 후. Fuse.js instance 생성 비용 회피. |
  | `GraphView` (`/graph` 페이지) | `client:only="react"` | SSR HTML 무의미 (d3가 DOM을 완전히 manipulate). SSR skip으로 layout shift 제거. |
  | `BrainPreview` (홈페이지) | `client:visible` | fold 이하 hero 아래에 위치. 처음 viewport에 없으면 hydration 지연. |

- **B2 (d3-force Volla 원본 대비 축소):** Volla `knowledge-graph.tsx` 기능 → meshblog에서 **포함/제외** 매트릭스.
  - **포함:** 노드 + 엣지 렌더, force simulation, zoom/pan, 노드 클릭 → href 이동 (notes 모드는 `/notes/[id]`, concept 모드는 concept detail ... 단 concept 페이지는 없으므로 click noop)
  - **제외:** entity edit modal, duplicate merge, timeline slider, panel with note preview, label visibility optimization (모두 Volla saas 기능)
  - 결과 타깃: ~200 lines, 4 d3 subpackage 사용. Volla 원본 파일은 **참조만**, 새로 쓴다 (copy-paste 하면 dead code 쌓임).

- **B3 (`react-markdown` 플러그인 셋 결정):** Volla는 `remark-gfm + remark-math + rehype-highlight + rehype-katex + rehype-raw`. meshblog Phase 3 subset:
  - **포함:** `remark-gfm` (tables, task list), `rehype-raw` (raw HTML in MD ... Obsidian callout 등)
  - **제외:** `remark-math` + `rehype-katex` (수식 드물고 KaTeX CSS 크다), `rehype-highlight` (Phase 5 디자인에서 결정)
  - **커스텀 rehype:** "entity wiki link" harvest는 **이번 phase에선 드랍**. 이유: entity wiki 페이지 자체가 Phase 4로 밀림 (Explicit drop 참조). 단, `[[wiki-link]]` 는 plain text로 렌더되면 흉하므로 **preprocess 단계에서 텍스트만 추출** (`[[Foo|Bar]]` → `Bar`, `[[Foo]]` → `Foo`). remark plugin 1개 자체 작성 (~20 lines, `lib/markdown/remark-wikilink-strip.ts`).

- **B4 (Fuse.js 범위 + 필드):** Phase 3 검색 컨텍스트 3가지.

  | Context | 데이터 source | Fuse 필드 + weight | Scope |
  |---|---|---|---|
  | 홈페이지 global chips | `qa_cards WHERE tier='global'` (≤10 rows) | `{ keys: ['question'] }` (단일, weight=1) | vault-wide |
  | 페이지 하단 chips (posts/notes) | `qa_cards WHERE tier='note' AND note_id=?` + `WHERE tier='concept' AND concept_id IN (note의 concept)` | `{ keys: [{ name: 'question', weight: 2 }, { name: 'answer', weight: 1 }] }` | page-local |
  | /graph 검색창 (선택) | `notes.title` + `concepts.name` | `{ keys: ['label'] }` | graph nodes only |

  - **결정:** global chips는 question text만, per-page chips는 question + answer 둘 다 인덱싱. 이유: 페이지 내에서 답변 키워드로도 찾고 싶을 수 있음. threshold = 0.4 (Fuse 기본). "가까운 글 3개 fallback"은 Fuse match 0개일 때 **해당 페이지 Top-3 related notes** (note_entities 공유 기준 pre-computed) 표시. pre-compute는 Task 4 (slugs.ts)에서 배치 처리.

### Patch C — GraphView 퍼포먼스 / UX 결정

- **C1 (초기 level):** `/graph` 진입 시 **L1만 로드** (`public/graph/note-l1.json` fetch). 이유: L1이 가장 작음 (현재 8 notes, 5 concepts). 첫 paint 최대한 빠름. 사용자가 L2/L3 토글 시 추가 fetch.

- **C2 (모드 스위치 기본값):** `/graph` 기본 모드 = **note**. 이유: 사용자 멘탈 모델에 note가 먼저 (글을 읽다 나온 flow). concept는 "내 머릿속 테마" ... 처음 방문자에겐 어려움. query string `?mode=concept&level=2` 로 deep link 지원 (공유 가능).

- **C3 (d3-force 쿨드운 + iterations):**
  - `alphaDecay = 0.02` (Volla 기본)
  - `forceManyBody().strength(-120)` (크기 조정 가능)
  - **200 노트 확장 대비:** `simulation.stop()` 을 `tick` 60회 후 호출 (pre-compute). Volla는 continuous run ... meshblog는 정적 그래프라 멈춰도 OK. 드래그 중에만 `alpha(0.3).restart()`.
  - cold-start 예산: 21 노트 기준 <200ms 기대, 200 노트 기준 <2s (경험적). 실측은 Phase 5 benchmark로 위임.

- **C4 (BrainPreview 구현):** 홈페이지 hero 아래 "brain teaser". 결정: **live d3-force mini (L1 only, zoom/drag disabled, click=graph 페이지로 이동).** 이유:
  - static SVG screenshot = 빌드 복잡 (headless browser 필요), 깨짐
  - `public/graph/note-l1.json` fetch 이미 있음 → 추가 비용 0
  - 21 노트 L1 = 8 node, force sim 20 tick = 10ms. 무시할 수 있음
  - 대신 **정말 simplified** ... 노드만 dot, 라벨 없음, 단색. 그래프 티저일 뿐 완전 인터랙션 아님.

- **C5 (노드 클릭 destination):**
  - Note 모드: 노드 id = `notes.id` = slug → `/notes/[slug]` 또는 `/posts/[slug]` 로 이동. 라우팅 판단은 클릭 시점 meta 필요 → node 데이터에 `folder_path`도 같이 export 해야 함 → **Task 3에서 `scripts/export-graph.ts` 재검토** (nodes에 `folder_path` 추가). 아니면 client에서 `folder_path` 매핑 JSON 별도 fetch.
  - **결정:** export-graph.ts를 건드리는 것보다 homepage 빌드 시 `/notes-manifest.json` (`{ id: '/posts/foo' }` 매핑) 1개 JSON 추가 생성. client가 fetch. cleaner.
  - Concept 모드: concept 페이지 없음 → 클릭 시 concept name으로 Fuse 검색 후 "이 개념이 나온 노트들" 인라인 표시. **이번 phase에선 기본 동작 = alert/console.log 대신 silent noop.** Phase 4에서 concept detail 페이지 or panel 검토.

### Patch D — 테스트 범위 + 빌드 검증

Phase 2 패턴 계승 ... stage-level smoke + regression fixture, **per-component unit test 지양**. 총 Phase 3 신규 tests = **5개**.

- **D1 (신규 테스트 5개):**
  1. `scripts/__tests__/page-data.test.ts` ... `src/lib/pages/` 헬퍼 (getPostBySlug, getNoteBySlug, getQaForNote, getRelatedNotes) DB query smoke. fixture DB seed → 예상 row count.
  2. `scripts/__tests__/slugs.test.ts` ... Korean slug encoding round-trip: `"01-글쓰기-패턴"` 을 `encodeURIComponent` → decode → equal, Astro `getStaticPaths` params 와 매칭.
  3. `scripts/__tests__/build-smoke.test.ts` (통합) ... `bun run build` 를 subprocess로 실행 (timeout 2분), `dist/index.html`, `dist/graph/index.html`, `dist/posts/01-react-hooks/index.html`, `dist/notes/06-graphology-graph-algorithms/index.html` 4개 파일 존재 + HTML에 예상 string ("meshblog", 노트 title) 포함 확인. Playwright 아님 ... 정적 파일 system check만.
  4. `scripts/__tests__/graph-json-manifest.test.ts` ... `public/graph/*.json` 6개 + `public/notes-manifest.json` 1개 valid + schema 맞음 (Patch C5에서 추가하는 manifest).
  5. `scripts/__tests__/markdown-render.test.ts` ... `src/lib/markdown/strip-wikilinks.ts` 유닛 (가장 작은 순수 함수). `[[Foo]]` → `Foo`, `[[Foo|Bar]]` → `Bar`, `[[]]` → `""`, nested 방어.

- **D2 (드롭하는 테스트):**
  - React 컴포넌트 rendering test (Testing Library, jsdom) → **드롭**. 이유: Astro + React island는 jsdom에서 재현 어렵고 (island props 주입 경계 복잡), Phase 2 retro 학습 ... smoke로 transitive 검증. 실제 bug는 `bun run build && open dist/...` 의 수동 verification.
  - Playwright / e2e → **드롭**. 이유: Phase 4에서 gh-pages 배포 후 live URL 에서 수행이 자연스러움. 지금 도입 시 WSL headless 환경 setup 추가 비용.

- **D3 (기존 테스트 영향):** Phase 2의 8 test file 기존 green 유지. Phase 3에서 `src/lib/`는 건드리지 않음 (새로운 `src/lib/pages/`, `src/lib/markdown/` 서브디렉토리 추가만). 기존 `porting-rules-lint.test.ts`, `schema-fk-type-lint.test.ts` 변경 없음.

### Patch E — Bundle 크기 / 빌드 시간 예산

- **E1 (의존성 크기 예상):**

  | Package | 설치 후 node_modules 크기 | 번들 import 예상 크기 |
  |---|---|---|
  | react + react-dom | ~5MB | ~42KB gzip |
  | react-markdown + remark-gfm + rehype-raw | ~3MB | ~25KB gzip |
  | fuse.js | ~300KB | ~8KB gzip |
  | d3-force + d3-selection + d3-zoom + d3-drag | ~1.5MB | ~30KB gzip |
  | @astrojs/react | ~200KB | 0 (빌드 plugin) |
  | **Total 추가** | **~10MB** | **~105KB gzip (graph 페이지 기준)** |

  - 수용 가능. graph 페이지는 d3 + react 모두 hydrate → 가장 무거움 (~105KB). homepage는 react + fuse + d3 mini = ~80KB. 정적 사이트이니 first-load 이후 캐시.

- **E2 (빌드 시간 예산):** 현재 Astro 빌드 `bun run build` = ~5s (static 1 page). Phase 3 이후 23 페이지 + 4 island = **target <30s**. 측정: Task 12에서 `time bun run build` 실행 기록, 초과 시 프로파일.

- **E3 (`.gitignore` 확인):** `dist/`, `node_modules/`, `.astro/` 이미 ignore됨. 추가 ignore 불필요. `public/graph/*.json`, `public/notes-manifest.json` 은 **커밋**할지 말지 Phase 4 결정 (CI에서 재생성이 원칙이지만 데모용 commit 가능). Phase 3에선 로컬 빌드 성공이 목표 → 커밋 여부 defer.

### Patch F — 도메인 관심사 / 접근성 / 콘텐츠 정책

- **F1 (한국어 + 영어 혼합 콘텐츠 처리):** fixture 분석:
  - posts/ 둘 다 한국어
  - notes/ 절반 영어, 절반 한국어 (`philosophy-on-writing.md`, `19-writing-for-developers.md` 한글 mix)
  - Astro `<html lang="...">`: 글별로 다름 → 정적 "ko-KR" or "en" 결정 어려움
  - **결정:** `<html lang="ko">` 고정 (본인 primary 언어). 페이지별 override 안 함. SEO 영향 미미 (정적 블로그).

- **F2 (코드 블록 스타일):** `react-markdown` 기본 `<pre><code>` 출력. highlighting 없음 (Phase 5). 유저 브라우저 default monospace. 가독성 충분. Phase 5에서 shiki 또는 Starry Night 검토.

- **F3 (이미지 / asset):** 현재 fixture MD 에 이미지 없음. Obsidian attachment 경로 (`![[img.png]]`) 처리는 Phase 4 `/new-post` 스킬 스펙에서 결정. Phase 3 scope = **이미지 없음 가정**. MD에 이미지 있으면 broken link (빌드 에러 아님, 단순 깨진 img).

- **F4 (a11y 최소):** `<html lang>`, `<nav aria-label>`, 버튼에 `aria-label`, 이미지 alt 정도. 색 대비 / 키보드 포커스 링은 Phase 5. Phase 3는 "semantic HTML + label만".

- **F5 (다크모드):** Phase 5로 미룸. 지금은 브라우저 기본 (흰 배경 검정 글씨).

---

## Pre-conditions

- Phase 2 완료: 9 테이블 schema + 3 script + 59 tests green
- `public/graph/*.json` 6개 파일 확인 (현재 존재 확인됨)
- `.data/index.db` 에 최소 fixture data 존재 (21 notes, entities, concepts; qa_cards는 live API 시 채워짐 ... 미실행 시 빈 테이블도 OK, Phase 3는 "있으면 렌더, 없으면 empty state" 방어)
- `bun run test` → 59 passing
- TypeScript strict 컴파일 0 error
- Node 22.12+

**없어도 OK (degraded render):**
- `qa_cards` 테이블 비어있음 → QAChips가 "No FAQ yet" empty state
- `concepts` 비어있음 → concept mode에서 "No concepts yet"
- live API keys ... Phase 3 구현/테스트 모두 불필요 (빌드타임 DB 읽기만)

---

## Task 0: 의존성 추가 + Astro React 통합

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`

**Why:** Phase 3의 모든 island는 `@astrojs/react`가 있어야 함. 단 1번, 모든 task의 gate.

**Implementation:**

Step 1 ... 의존성 설치:
```bash
bun add react react-dom @astrojs/react
bun add react-markdown remark-gfm rehype-raw
bun add fuse.js
bun add d3-force d3-selection d3-zoom d3-drag
bun add -d @types/react @types/react-dom @types/d3-force @types/d3-selection @types/d3-zoom @types/d3-drag
```

Step 2 ... `astro.config.mjs` 업데이트:
```js
// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  integrations: [react()],
  output: 'static',
  build: { format: 'directory' },
  vite: {
    ssr: { noExternal: [] },
    optimizeDeps: { exclude: ['better-sqlite3'] },
  },
})
```

Step 3 ... 타입 체크: `bunx tsc --noEmit` → 0 error.

Step 4 ... 빌드 smoke: `bun run build` → 기존 index.astro 그대로 빌드 성공.

**Exit criteria:**
- `package.json`에 react 관련 8+ 패키지 추가
- `bun run build` 성공, `dist/index.html` 존재
- `bun run test` 59 pass (변경 없어야 함)

**Commit:** `chore(phase3): add @astrojs/react + react-markdown + fuse + d3 deps`

**Time:** 20분

---

## Task 1: Page data helpers (`src/lib/pages/`)

**Files:**
- Create: `src/lib/pages/index.ts` ... barrel export
- Create: `src/lib/pages/db.ts` ... readonly DB opener
- Create: `src/lib/pages/posts.ts` ... `listPosts()`, `getPostBySlug(slug)`
- Create: `src/lib/pages/notes.ts` ... `listNotes()`, `getNoteBySlug(slug)`
- Create: `src/lib/pages/qa.ts` ... `getQaGlobal()`, `getQaForNote(noteId)`, `getQaForConcept(conceptId)`
- Create: `src/lib/pages/related.ts` ... `getRelatedNotes(noteId, limit=3)`
- Create: `scripts/__tests__/page-data.test.ts`

**Why:** 모든 Astro 페이지는 build time에 DB query를 함. 각 페이지에 raw SQL을 박으면 중복 + 유지보수 지옥. 단일 helper 레이어 필수. Phase 2의 `src/lib/db/index.ts`는 write-oriented ... readonly openable용 분리.

**Implementation:**

Step 1 ... `src/lib/pages/db.ts`:
```ts
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'

const DB_PATH = process.env.MESHBLOG_DB ?? '.data/index.db'

export function openReadonlyDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
    db.pragma('query_only = ON')
    return db
  } catch (err) {
    console.error('[pages/db] open failed:', err)
    return null
  }
}
```

Step 2 ... `src/lib/pages/posts.ts`:
```ts
import type Database from 'better-sqlite3'

export type PostRow = {
  id: string
  slug: string
  title: string
  content: string
  tags: string[]
  created_at: string
  updated_at: string
  level_pin: number | null
}

export function listPosts(db: Database.Database): PostRow[] {
  const rows = db.prepare(`
    SELECT id, slug, title, content, tags, created_at, updated_at, level_pin
    FROM notes
    WHERE folder_path = '/posts'
    ORDER BY datetime(updated_at) DESC
  `).all() as Array<Omit<PostRow, 'tags'> & { tags: string }>
  return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
}

export function getPostBySlug(db: Database.Database, slug: string): PostRow | null {
  const row = db.prepare(`
    SELECT id, slug, title, content, tags, created_at, updated_at, level_pin
    FROM notes
    WHERE folder_path = '/posts' AND slug = ?
    LIMIT 1
  `).get(slug) as any
  if (!row) return null
  return { ...row, tags: JSON.parse(row.tags || '[]') }
}
```

Step 3 ... `src/lib/pages/notes.ts`: 구조 동일, `folder_path = '/notes'`.

Step 4 ... `src/lib/pages/qa.ts`:
```ts
export type QaRow = { id: string; tier: 'note' | 'concept' | 'global'; question: string; answer: string }

export function getQaGlobal(db: Database.Database): QaRow[] {
  return db.prepare(`SELECT id, tier, question, answer FROM qa_cards WHERE tier='global' ORDER BY created_at`).all() as QaRow[]
}
export function getQaForNote(db: Database.Database, noteId: string): QaRow[] {
  return db.prepare(`SELECT id, tier, question, answer FROM qa_cards WHERE tier='note' AND note_id=? ORDER BY created_at`).all(noteId) as QaRow[]
}
export function getQaForConceptsOfNote(db: Database.Database, noteId: string): QaRow[] {
  return db.prepare(`
    SELECT DISTINCT q.id, q.tier, q.question, q.answer FROM qa_cards q
    WHERE q.tier='concept' AND q.concept_id IN (
      SELECT DISTINCT ce.concept_id FROM concept_entities ce
      JOIN note_entities ne ON ne.entity_id = ce.entity_id
      WHERE ne.note_id = ?
    )
    ORDER BY q.created_at
  `).all(noteId) as QaRow[]
}
```

Step 5 ... `src/lib/pages/related.ts`:
```ts
export type RelatedNote = { id: string; slug: string; title: string; folder_path: string; shared: number }

export function getRelatedNotes(db: Database.Database, noteId: string, limit = 3): RelatedNote[] {
  return db.prepare(`
    SELECT n.id, n.slug, n.title, n.folder_path, COUNT(*) as shared
    FROM note_entities ne1
    JOIN note_entities ne2 ON ne2.entity_id = ne1.entity_id AND ne2.note_id != ne1.note_id
    JOIN notes n ON n.id = ne2.note_id
    WHERE ne1.note_id = ?
    GROUP BY n.id
    ORDER BY shared DESC, datetime(n.updated_at) DESC
    LIMIT ?
  `).all(noteId, limit) as RelatedNote[]
}
```

Step 6 ... `src/lib/pages/index.ts` (barrel):
```ts
export * from './db'
export * from './posts'
export * from './notes'
export * from './qa'
export * from './related'
```

Step 7 ... `scripts/__tests__/page-data.test.ts`: fixture DB 생성 (기존 `build-index.test.ts` 패턴 차용) → seed 3 notes + 2 qa_cards → 각 helper 호출 후 row count + 필드 타입 확인.

**Exit criteria:**
- 6 new files in `src/lib/pages/`
- `bun run test` +1 test file passing (page-data)
- `bunx tsc --noEmit` clean

**Commit:** `feat(phase3): add src/lib/pages/ readonly data helpers`

**Time:** 1.5h

---

## Task 2: Markdown utility ... wikilink strip + render helper

**Files:**
- Create: `src/lib/markdown/strip-wikilinks.ts` ... 순수 함수, `[[x]]`/`[[x|y]]` 처리
- Create: `src/lib/markdown/preprocess.ts` ... MD 전체 전처리 파이프라인
- Create: `scripts/__tests__/markdown-render.test.ts`

**Why:** Obsidian vault는 `[[wiki-link]]` 문법을 쓴다. Phase 3에선 wiki 페이지가 없으므로 (Explicit drop), link를 제거하되 텍스트는 보존해야 한다 (Patch B3).

**Implementation:**

Step 1 ... `strip-wikilinks.ts`:
```ts
export function stripWikilinks(md: string): string {
  return md.replace(/\[\[([^\]|]*)(\|([^\]]*))?\]\]/g, (_, target, _pipe, alias) => {
    if (alias) return alias
    if (target) return target
    return ''
  })
}
```

Step 2 ... `preprocess.ts`:
```ts
import { stripWikilinks } from './strip-wikilinks'
export function preprocessMarkdown(raw: string): string {
  let md = stripWikilinks(raw)
  return md
}
```

Step 3 ... test: `[[X]]`, `[[X|Y]]`, `[[]]`, 연속 `[[A]][[B]]`, 일반 MD 링크 `[X](y)` 보존, 라인 내 혼재.

**Exit criteria:**
- 2 utility files + 1 test
- 6+ assertions in test, all pass
- No side effects (pure function)

**Commit:** `feat(phase3): add markdown wikilink-strip preprocessor`

**Time:** 45분

---

## Task 3: `/notes-manifest.json` 생성기 + export-graph 경로 업데이트

**Files:**
- Create: `scripts/build-manifest.ts` ... `public/notes-manifest.json` 생성
- Modify: `package.json` ... `build-manifest` script + `build-all` 체인에 추가
- Create: `scripts/__tests__/graph-json-manifest.test.ts`

**Why:** Patch C5 결정. GraphView 노드 클릭 시 `/posts/[slug]` 또는 `/notes/[slug]` 중 어디로 갈지 판단 필요. `public/graph/*.json`에는 `folder_path` 없음. 추가 manifest 1개 생성이 가장 간단.

**Implementation:**

Step 1 ... `scripts/build-manifest.ts`:
```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { openReadonlyDb } from '../src/lib/pages/db'

type ManifestEntry = { id: string; href: string; title: string; folder: 'posts' | 'notes' }

async function main() {
  const db = openReadonlyDb()
  if (!db) { console.error('[manifest] no DB'); process.exit(1) }

  const notes = db.prepare(`SELECT id, slug, title, folder_path FROM notes`).all() as any[]
  const manifest: Record<string, ManifestEntry> = {}
  for (const n of notes) {
    const folder = n.folder_path === '/posts' ? 'posts' : 'notes'
    manifest[n.id] = {
      id: n.id,
      href: `/${folder}/${encodeURIComponent(n.slug)}/`,
      title: n.title,
      folder,
    }
  }

  mkdirSync('public', { recursive: true })
  writeFileSync('public/notes-manifest.json', JSON.stringify(manifest, null, 2))
  console.log(`[manifest] wrote ${Object.keys(manifest).length} entries`)
  db.close()
}

main().catch(e => { console.error(e); process.exit(1) })
```

Step 2 ... `package.json`:
```json
"build-manifest": "tsx scripts/build-manifest.ts",
"build-all": "bun run build-index && bun run generate-qa && bun run export-graph && bun run build-manifest"
```

Step 3 ... 테스트: fixture DB seed → script 실행 → JSON 파싱 → entry 3개 예상, `folder` 판단 정확.

**Exit criteria:**
- `public/notes-manifest.json` 존재 + 21+ entry (현 fixture 기준)
- `bun run build-manifest` 성공
- 1 new test pass

**Commit:** `feat(phase3): add notes-manifest.json for graph click routing`

**Time:** 45분

---

## Task 4: `MarkdownView` React island

**Files:**
- Create: `src/components/MarkdownView.tsx`

**Why:** 본문 렌더 단일 컴포넌트. `posts/[slug].astro` + `notes/[slug].astro` 둘 다 사용.

**Implementation:**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { preprocessMarkdown } from '../lib/markdown/preprocess'

type Props = {
  markdown: string
  title?: string
}

export default function MarkdownView({ markdown, title }: Props) {
  const processed = preprocessMarkdown(markdown)
  return (
    <article>
      {title && <h1>{title}</h1>}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} rel="noopener noreferrer" {...rest}>{children}</a>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </article>
  )
}
```

**Exit criteria:**
- 파일 존재, type-check clean
- Astro 페이지에서 `<MarkdownView client:load markdown={...} />` 으로 import 가능
- wikilink `[[Foo]]` 가 plain text "Foo" 로 렌더

**Commit:** `feat(phase3): add MarkdownView react island`

**Time:** 30분

---

## Task 5: `QAChips` React island

**Files:**
- Create: `src/components/QAChips.tsx`

**Why:** 홈페이지 (global tier), posts/notes 상세 (note + concept tier) 둘 다에서 재사용. Fuse.js fuzzy match.

**Implementation:**

```tsx
import { useMemo, useState } from 'react'
import Fuse from 'fuse.js'

type Qa = { id: string; tier: 'note' | 'concept' | 'global'; question: string; answer: string }
type Related = { id: string; href: string; title: string }

type Props = {
  qas: Qa[]
  scope: 'global' | 'page'
  related?: Related[]
}

export default function QAChips({ qas, scope, related = [] }: Props) {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const fuse = useMemo(() => {
    const keys = scope === 'global'
      ? ['question']
      : [{ name: 'question', weight: 2 }, { name: 'answer', weight: 1 }]
    return new Fuse(qas, { keys: keys as any, threshold: 0.4, includeScore: true })
  }, [qas, scope])

  const filtered = query.trim() === '' ? qas : fuse.search(query).map(r => r.item)
  const showFallback = query.trim() !== '' && filtered.length === 0 && related.length > 0

  if (qas.length === 0) return <p><em>FAQ가 아직 생성되지 않았습니다. (Phase 2 build-qa 실행 필요)</em></p>

  return (
    <section aria-label="FAQ">
      <input
        type="search"
        placeholder={scope === 'global' ? "vault에 질문해보세요" : "이 글에 질문해보세요"}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <ul>
        {filtered.map(q => (
          <li key={q.id}>
            <button onClick={() => setOpenId(openId === q.id ? null : q.id)} aria-expanded={openId === q.id}>
              {q.question} <small>[{q.tier}]</small>
            </button>
            {openId === q.id && <p>{q.answer}</p>}
          </li>
        ))}
      </ul>
      {showFallback && (
        <div>
          <p><em>답변을 찾지 못했습니다. 가까운 글:</em></p>
          <ul>
            {related.map(r => <li key={r.id}><a href={r.href}>{r.title}</a></li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
```

**Exit criteria:**
- empty qas → "not generated" empty state
- query 입력 시 filter 동작
- 0-hit + related ≥ 1 → fallback 표시
- chip click → answer 펼침/접힘

**Commit:** `feat(phase3): add QAChips island with fuse + fallback`

**Time:** 1h

---

## Task 6: `GraphView` React island (핵심)

**Files:**
- Create: `src/components/GraphView.tsx`
- Create: `src/components/graph/types.ts` ... GraphNode, GraphLink, GraphJson
- Create: `src/components/graph/useForceSimulation.ts` ... d3-force wrapper hook

**Why:** `/graph` 페이지의 주 기능. d3-force로 노드 레이아웃 + zoom/pan + 모드/레벨 스위치.

**Implementation:**

Step 1 ... `graph/types.ts`:
```ts
export type GraphNode = {
  id: string
  label: string
  type: 'note' | 'concept'
  level: 1 | 2 | 3
  pagerank: number
  pinned: boolean
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}
export type GraphLink = { source: string | GraphNode; target: string | GraphNode; weight: number }
export type GraphJson = { nodes: GraphNode[]; links: GraphLink[] }
export type Manifest = Record<string, { id: string; href: string; title: string; folder: 'posts' | 'notes' }>
```

Step 2 ... `useForceSimulation.ts`: d3-force simulation 생성 + useEffect로 정리. 60 tick 후 `simulation.stop()` (Patch C3). drag 시 alpha 0.3 restart.

Step 3 ... `GraphView.tsx` (skeleton):
```tsx
import { useEffect, useRef, useState } from 'react'
import type { GraphJson, Manifest, GraphNode } from './graph/types'
import { useForceSimulation } from './graph/useForceSimulation'

type Mode = 'note' | 'concept'
type Level = 1 | 2 | 3

export default function GraphView() {
  const [mode, setMode] = useState<Mode>(() => {
    const p = new URLSearchParams(location.search).get('mode')
    return p === 'concept' ? 'concept' : 'note'
  })
  const [level, setLevel] = useState<Level>(() => {
    const p = Number(new URLSearchParams(location.search).get('level') ?? '1')
    return (p === 2 || p === 3) ? p as Level : 1
  })
  const [graph, setGraph] = useState<GraphJson | null>(null)
  const [manifest, setManifest] = useState<Manifest>({})
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let cancel = false
    Promise.all([
      fetch(`/graph/${mode}-l${level}.json`).then(r => r.json() as Promise<GraphJson>),
      fetch(`/notes-manifest.json`).then(r => r.json() as Promise<Manifest>).catch(() => ({})),
    ]).then(([g, m]) => { if (!cancel) { setGraph(g); setManifest(m) } })
    return () => { cancel = true }
  }, [mode, level])

  useEffect(() => {
    const q = new URLSearchParams({ mode, level: String(level) })
    history.replaceState(null, '', `?${q.toString()}`)
  }, [mode, level])

  useForceSimulation(svgRef, graph, {
    onNodeClick: (node: GraphNode) => {
      if (node.type === 'note' && manifest[node.id]) {
        location.href = manifest[node.id].href
      }
    },
  })

  return (
    <div>
      <div role="toolbar" aria-label="graph controls">
        <fieldset>
          <legend>Mode</legend>
          <label><input type="radio" checked={mode === 'note'} onChange={() => setMode('note')} /> Notes</label>
          <label><input type="radio" checked={mode === 'concept'} onChange={() => setMode('concept')} /> Concepts</label>
        </fieldset>
        <fieldset>
          <legend>Level</legend>
          {[1, 2, 3].map(l => (
            <label key={l}>
              <input type="radio" checked={level === l} onChange={() => setLevel(l as Level)} /> L{l}
            </label>
          ))}
        </fieldset>
      </div>
      <svg ref={svgRef} width="100%" height="600" style={{ border: '1px solid #ccc' }} />
      {graph && <p><small>{graph.nodes.length} nodes · {graph.links.length} links</small></p>}
    </div>
  )
}
```

Step 4 ... `useForceSimulation.ts` 실질 구현: nodes/links를 d3-force simulation에 주입, SVG에 circle + line draw, zoom behavior 부착, drag behavior 부착, 60 tick 후 stop, cleanup에서 simulation.stop(). 참고: Volla `knowledge-graph.tsx` 300~500 lines 영역.

**Exit criteria:**
- `/graph` 페이지 로드 시 SVG 렌더 + 노드 circle 표시
- 모드 라디오 클릭 시 새 JSON fetch + 재렌더
- Level 라디오 클릭 시 동일
- URL `?mode=concept&level=2` 로 초기 상태 설정됨
- 노트 모드 노드 클릭 시 `/notes/[slug]` 또는 `/posts/[slug]` 이동
- 드래그 + 줌/팬 동작

**Commit:** `feat(phase3): add GraphView island with d3-force + mode/level toggle`

**Time:** 4h (가장 큰 task)

---

## ~~Task 7: `BrainPreview` React island (홈 teaser)~~ **[DROPPED per CEO review]**

> **Decision #2**: BrainPreview 드롭됨. CEO 리뷰 결과 "30KB 번들 + 1h 비용 대비 PRD 성공 기준 B 에 직접 기여 0", "홈페이지 hero는 Phase 5 디자인에서 제대로 처리". 홈페이지는 text-based hero 유지.
> **대체**: Task 7' (아래) — `scripts/build-og.ts` + RSS `public/atom.xml` 생성.

## ~~Original Task 7 Content (reference only)~~

**Files:**
- Create: `src/components/BrainPreview.tsx`

**Why:** 홈페이지 fold 이하 hero 아래 "mini graph". Patch C4.

**Implementation:**

```tsx
import { useEffect, useRef, useState } from 'react'
import * as d3Force from 'd3-force'
import type { GraphJson } from './graph/types'

export default function BrainPreview() {
  const [graph, setGraph] = useState<GraphJson | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetch('/graph/note-l1.json').then(r => r.json()).then(setGraph).catch(() => {})
  }, [])

  useEffect(() => {
    if (!graph || !svgRef.current) return
    const width = 400, height = 200
    const sim = d3Force.forceSimulation(graph.nodes as any)
      .force('charge', d3Force.forceManyBody().strength(-40))
      .force('link', d3Force.forceLink(graph.links).id((d: any) => d.id).distance(30))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .stop()
    for (let i = 0; i < 20; i++) sim.tick()
    const svg = svgRef.current
    svg.innerHTML = ''
    const ns = 'http://www.w3.org/2000/svg'
    for (const l of graph.links as any[]) {
      const line = document.createElementNS(ns, 'line')
      line.setAttribute('x1', l.source.x); line.setAttribute('y1', l.source.y)
      line.setAttribute('x2', l.target.x); line.setAttribute('y2', l.target.y)
      line.setAttribute('stroke', '#999'); line.setAttribute('stroke-width', '1')
      svg.appendChild(line)
    }
    for (const n of graph.nodes as any[]) {
      const c = document.createElementNS(ns, 'circle')
      c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', '3')
      c.setAttribute('fill', '#333')
      svg.appendChild(c)
    }
  }, [graph])

  return (
    <a href="/graph" aria-label="Open graph view">
      <svg ref={svgRef} width={400} height={200} style={{ border: '1px solid #eee' }} />
      <p><small>Explore the full graph →</small></p>
    </a>
  )
}
```

**Exit criteria:**
- 홈에서 렌더, 21 fixture 기준 8개 node 보임
- 클릭 시 `/graph` 이동

**Commit:** ~~`feat(phase3): add BrainPreview homepage teaser`~~ **DROPPED**

**Time:** ~~1h~~ 0h (replaced by Task 7')

---

## Task 7': OG/Twitter card 정적 생성 + RSS atom.xml [NEW per CEO review]

**Files:**
- Create: `scripts/build-og.ts` — `public/og/{index,posts/<slug>,notes/<slug>}.png` 생성
- Create: `scripts/build-rss.ts` — `public/atom.xml` posts feed
- Modify: `src/layouts/Base.astro` — `<meta property="og:image">`, `<meta name="twitter:card">`
- Modify: `package.json` — scripts + `build-all` 체인에 추가

**Why:** PRD 성공 기준 B = "친구/트위터/HN 공유 가능 퀄리티". OG 이미지 없이는 공유 링크가 텍스트만 → 클릭률 50% 하락 (알려진 수치). RSS는 follow-able = re-visit 유도. 둘 다 Phase 3 scope.

**Implementation:**

Step 1 — `build-og.ts`: SVG 템플릿 2종 (homepage, post/note) — 제목 + 부제 + meshblog 로고. `@resvg/resvg-js` 또는 `satori`+`resvg-wasm`으로 SVG→PNG 변환. 1200×630 고정.
```ts
// pseudocode: listPosts + listNotes + homepage → for each, render SVG string with title + site name → resvg → PNG to public/og/<path>.png
```

Step 2 — `build-rss.ts`: `listPosts()` → atom 1.0 XML (id=URL, updated=updated_at, entry=posts만).

Step 3 — `Base.astro`에 prop `ogImage` 추가:
```astro
const { title, description = '...', ogImage = '/og/index.png' } = Astro.props
<meta property="og:type" content="website" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={new URL(ogImage, Astro.site).toString()} />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content={new URL(ogImage, Astro.site).toString()} />
<link rel="alternate" type="application/atom+xml" href="/atom.xml" title="meshblog posts" />
```

Step 4 — posts/[slug], notes/[slug]에 `ogImage={`/og/${folder}/${encodeURIComponent(slug)}.png`}` prop 전달.

Step 5 — `package.json`:
```json
"build-og": "tsx scripts/build-og.ts",
"build-rss": "tsx scripts/build-rss.ts",
"build-all": "bun run build-index && bun run generate-qa && bun run export-graph && bun run build-manifest && bun run build-og && bun run build-rss"
```

**Dependencies 추가 (Task 0 업데이트):** `bun add @resvg/resvg-js` (또는 `satori` + `@resvg/resvg-wasm`).

**Exit criteria:**
- `public/og/index.png` 1200×630 존재
- 각 post/note slug별 OG PNG 존재
- `public/atom.xml` valid atom 1.0 (`xmllint --noout` or regex sanity)
- Base.astro에 og:* + twitter:* 5개 meta 존재
- `/atom.xml` alternate link rel 존재

**Commit:** `feat(phase3): add OG card generator + atom.xml RSS feed`

**Time:** 1h

---

## Task 8: Astro 페이지 ... `index.astro` 재작성

**Files:**
- Modify: `src/pages/index.astro`
- Create: `src/layouts/Base.astro` ... 공통 `<html><head>` 레이아웃

**Why:** 현재 index는 debug "Top Entities" 리스트만. Phase 3는 홈 = 최신 posts feed + BrainPreview + global Q&A chips.

**Implementation:**

Step 1 ... `src/layouts/Base.astro`:
```astro
---
type Props = { title: string; description?: string }
const { title, description = 'meshblog ... public second brain' } = Astro.props
---
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <nav aria-label="site">
      <a href="/">Home</a> · <a href="/graph">Graph</a>
    </nav>
    <main>
      <slot />
    </main>
    <footer>
      <small>meshblog · <a href="https://github.com/qkdwodus777/meshblog">source</a></small>
    </footer>
  </body>
</html>
```

Step 2 ... `src/pages/index.astro`:
```astro
---
import Base from '../layouts/Base.astro'
import QAChips from '../components/QAChips.tsx'
import { openReadonlyDb, listPosts, getQaGlobal } from '../lib/pages'

const db = openReadonlyDb()
const posts = db ? listPosts(db) : []
const globalQa = db ? getQaGlobal(db) : []
if (db) db.close()

const topPosts = posts.slice(0, 10)
---
<Base title="meshblog">
  <h1>meshblog</h1>
  <p><em>A public second brain that answers questions ... without a server.</em></p>

  {posts.length === 0 && (
    <section>
      <p>No posts yet. Add markdown to <code>content/posts/</code> then run <code>bun run build-all</code>.</p>
    </section>
  )}

  {posts.length > 0 && (
    <>
      <section>
        <h2>Latest posts</h2>
        <ul>
          {topPosts.map((p) => (
            <li>
              <a href={`/posts/${encodeURIComponent(p.slug)}/`}>{p.title}</a>
              <small> ... {p.updated_at.slice(0, 10)}</small>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Ask the vault</h2>
        <QAChips client:visible qas={globalQa} scope="global" />
      </section>
    </>
  )}
</Base>
```

**Exit criteria:**
- `bun run build` 성공, `dist/index.html` 생성
- posts feed 2개 노출 (현재 fixture)
- BrainPreview SVG + QAChips input 노출
- DB 없을 때 degraded empty state 동작

**Commit:** `feat(phase3): rebuild index.astro with posts feed + BrainPreview + global QA`

**Time:** 1h

---

## Task 9: Astro 페이지 ... `posts/[slug].astro`

**Files:**
- Create: `src/pages/posts/[slug].astro`

**Why:** 개별 post 상세 페이지. MarkdownView + per-note QAChips + related notes.

**Implementation:**

```astro
---
import Base from '../../layouts/Base.astro'
import MarkdownView from '../../components/MarkdownView.tsx'
import QAChips from '../../components/QAChips.tsx'
import {
  openReadonlyDb, listPosts, getPostBySlug,
  getQaForNote, getQaForConceptsOfNote, getRelatedNotes,
} from '../../lib/pages'

export async function getStaticPaths() {
  const db = openReadonlyDb()
  if (!db) return []
  const posts = listPosts(db)
  db.close()
  return posts.map((p) => ({ params: { slug: p.slug }, props: { id: p.id } }))
}

const { slug } = Astro.params
const { id } = Astro.props

const db = openReadonlyDb()
if (!db) throw new Error('DB not available at build time')
const post = getPostBySlug(db, slug as string)
if (!post) throw new Error(`Post not found: ${slug}`)
const noteQa = getQaForNote(db, post.id)
const conceptQa = getQaForConceptsOfNote(db, post.id)
const related = getRelatedNotes(db, post.id, 3).map(r => ({
  id: r.id,
  href: `/${r.folder_path === '/posts' ? 'posts' : 'notes'}/${encodeURIComponent(r.slug)}/`,
  title: r.title,
}))
db.close()

const allQa = [...noteQa, ...conceptQa]
---
<Base title={post.title}>
  <nav aria-label="breadcrumb"><a href="/">← Home</a></nav>
  <MarkdownView client:load markdown={post.content} title={post.title} />

  <section>
    <h2>Tags</h2>
    <ul>{post.tags.map((t) => <li>#{t}</li>)}</ul>
  </section>

  <section>
    <h2>Ask this post</h2>
    <QAChips client:visible qas={allQa} scope="page" related={related} />
  </section>

  <section>
    <h2>Related</h2>
    <ul>
      {related.map(r => <li><a href={r.href}>{r.title}</a></li>)}
    </ul>
  </section>
</Base>
```

**Exit criteria:**
- `dist/posts/01-react-hooks/index.html` 존재
- `dist/posts/02-nextjs-rsc/index.html` 존재
- MD 본문 렌더, tags 노출, QAChips + related 노출
- 존재하지 않는 slug 요청 시 Astro 기본 404

**Commit:** `feat(phase3): add posts/[slug] detail page`

**Time:** 1h

---

## Task 10: Astro 페이지 ... `notes/[slug].astro`

**Files:**
- Create: `src/pages/notes/[slug].astro`

**Why:** notes는 posts와 구조 거의 동일 (구분: folder_path, 약간 다른 호출). 중복을 수용 ... 두 페이지의 trivial difference(breadcrumb, title prefix)를 위한 별도 파일이 Astro 관례.

**Implementation:** posts/[slug].astro의 변형. `listNotes` / `getNoteBySlug` 사용, folder `/notes`. 구조는 동일하여 생략 (Task 9 참조).

**주의:** 한글 slug fixture 없지만 `encodeURIComponent` 경유로 안전. Astro는 build 시 `getStaticPaths()`의 params를 그대로 URL에 쓰므로 `encodeURIComponent` 를 **params가 아닌 href 생성 시** 적용. Astro의 `params.slug`는 raw string이므로 `getNoteBySlug(db, slug)` 로 DB 쿼리 시엔 decode 불필요 (DB에 raw slug 저장).

**Exit criteria:**
- `dist/notes/06-graphology-graph-algorithms/index.html` 등 21 파일 존재
- `dist/notes/philosophy-on-writing/index.html` 존재 (한글 body MD, 영문 slug)
- 모든 페이지에 title + content + Tags + QAChips + Related

**Commit:** `feat(phase3): add notes/[slug] detail page`

**Time:** 45분 (Task 9 재활용)

---

## Task 11: Astro 페이지 ... `graph.astro`

**Files:**
- Create: `src/pages/graph.astro`

**Why:** `/graph` 단일 진입점. GraphView island를 full-height로 렌더.

**Implementation:**

```astro
---
import Base from '../layouts/Base.astro'
import GraphView from '../components/GraphView.tsx'
---
<Base title="Graph · meshblog">
  <h1>Graph</h1>
  <p><em>Two graphs of your mind. Click a node to jump to the page.</em></p>
  <GraphView client:only="react" />
</Base>
```

**주의:** `client:only="react"` ... SSR skip. GraphView 내부에서 `location.search` 읽으므로 SSR 불가.

**Exit criteria:**
- `dist/graph/index.html` 존재, SVG 렌더링은 hydration 후
- 모드/레벨 토글 동작, URL 파라미터 반영

**Commit:** `feat(phase3): add graph.astro page`

**Time:** 20분

---

## Task 12: 빌드 smoke 테스트 + `bun run build` 검증

**Files:**
- Create: `scripts/__tests__/build-smoke.test.ts`

**Why:** Phase 2 방식 계승 ... per-component 유닛 대신 "통합 빌드가 산출물을 뱉는가" smoke.

**Implementation:**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

describe('build smoke', () => {
  beforeAll(() => {
    execSync('bun run build-manifest && bun run build', { stdio: 'inherit', timeout: 180_000 })
  }, 200_000)

  it('emits homepage', () => {
    expect(existsSync('dist/index.html')).toBe(true)
    const html = readFileSync('dist/index.html', 'utf-8')
    expect(html).toContain('meshblog')
  })

  it('emits graph page', () => {
    expect(existsSync('dist/graph/index.html')).toBe(true)
  })

  it('emits post detail pages', () => {
    expect(existsSync('dist/posts/01-react-hooks/index.html')).toBe(true)
    expect(existsSync('dist/posts/02-nextjs-rsc/index.html')).toBe(true)
  })

  it('emits note detail pages', () => {
    expect(existsSync('dist/notes/06-graphology-graph-algorithms/index.html')).toBe(true)
    expect(existsSync('dist/notes/philosophy-on-writing/index.html')).toBe(true)
  })

  it('copies graph JSON to dist', () => {
    expect(existsSync('dist/graph/note-l1.json')).toBe(true)
    expect(existsSync('dist/notes-manifest.json')).toBe(true)
  })
})
```

**주의:** 이 test는 slow (30s 이상). `vitest.config` 에서 `testTimeout` 상향 or 별도 `test:integration` script로 분리. Phase 2 패턴 참고.

**Exit criteria:**
- `bun run test` 녹색 (기존 59 + Phase 3 신규 5 = 64 tests)
- integration smoke 1 file 통과

**Commit:** `test(phase3): add build smoke + page data + markdown + manifest tests`

**Time:** 1h

---

## Task 12b: Q&A search evaluation fixture [NEW per CEO review]

**Files:**
- Create: `scripts/eval-qa-search.ts`
- Create: `test/fixtures/qa-eval-seed.json` — 20 seed `{ question, expectedQaId, expectedTier }`
- Modify: `package.json` — `eval-qa` script

**Why:** PRD 핵심 태그라인은 "vault에 물어보세요". Fuse.js threshold=0.4 + question/answer weighted keys 조합이 실제 질문에 대해 recall을 내는지 **검증 없이 출시하면** CEO 리뷰 E1 위험(silent failure mode)이 실현된다. 20개 seed 질문 → 예상 QA id 매핑을 만들고 recall ≥70% gate로 Phase 3 완료 기준에 포함.

**Implementation:**

Step 1 — `qa-eval-seed.json`: 21 fixture notes와 실제 생성된 `qa_cards`를 기반으로, 사람이 자연스럽게 물을 만한 20개 질문을 수동 작성. 각 질문마다 정답 `qa_card.id` + `tier` 명시. 5개는 오타/다른 표현 포함 (resilience test).

Step 2 — `eval-qa-search.ts`:
```ts
import Fuse from 'fuse.js'
import { openReadonlyDb, getQaGlobal, getQaForNote } from '../src/lib/pages'
import seed from '../test/fixtures/qa-eval-seed.json'

const db = openReadonlyDb()!
const allQa = db.prepare(`SELECT id, tier, question, answer, note_id, concept_id FROM qa_cards`).all() as any[]
const fuse = new Fuse(allQa, {
  keys: [{ name: 'question', weight: 2 }, { name: 'answer', weight: 1 }],
  threshold: 0.4,
  includeScore: true,
})

let hit = 0
for (const { question, expectedQaId } of seed) {
  const top3 = fuse.search(question).slice(0, 3).map(r => r.item.id)
  if (top3.includes(expectedQaId)) hit++
  else console.log(`MISS: "${question}" → expected ${expectedQaId}, got [${top3.join(', ')}]`)
}
const recall = hit / seed.length
console.log(`\nRecall@3: ${hit}/${seed.length} = ${(recall * 100).toFixed(1)}%`)
process.exit(recall >= 0.7 ? 0 : 1)
```

Step 3 — 최초 실행 시 recall 낮으면 2차 튜닝:
- threshold 0.3 ~ 0.5 sweep
- keys weight 변경
- Fuse option `ignoreLocation: true` 추가
- 최종 값을 `QAChips.tsx`에 반영 + rationale comment

**Exit criteria:**
- 20 seed 파일 존재, 모두 valid QA id 매핑
- `bun run eval-qa` → recall@3 ≥ 70%, exit 0
- 튜닝 후 최종 Fuse option이 `QAChips.tsx`와 `eval-qa-search.ts` 두 곳에서 sync (또는 shared config)

**Commit:** `test(phase3): add QA search eval fixture + recall gate`

**Time:** 2h

---

## Task 13: README + docs 업데이트

**Files:**
- Modify: `README.md`
- Create: `docs/plans/phase3-retro.md` (Task 14에서 채움)

**Why:** 새 script (`build-manifest`), 새 페이지 구조, visitor UX 사용법 문서화.

**Implementation:**

Step 1 ... `README.md`에 "Pages" 섹션 추가:
```markdown
## Pages
- `/` ... latest posts + brain preview + global Q&A chips
- `/posts/[slug]` ... post detail + per-post Q&A + related
- `/notes/[slug]` ... note detail (atomic KM)
- `/graph` ... d3-force graph, mode (note/concept) + level (L1/L2/L3) toggle, deep-link via `?mode=&level=`

## Build pipeline (Phase 3)
1. `bun run setup`
2. `bun run build-index` ... MD → SQLite
3. `bun run generate-qa` ... 3-tier FAQ (needs claude CLI)
4. `bun run export-graph` ... 6 graph JSON
5. `bun run build-manifest` ... `public/notes-manifest.json` (click routing)
6. `bun run build && bun run preview` ... Astro static

Or run steps 2–5 at once: `bun run build-all`.
```

Step 2 ... "Development notes" 섹션에 island hydration 전략 (Patch B1) 압축 요약.

**Exit criteria:**
- README에 Pages + Pipeline 섹션 존재
- CLI 명령 5개 리스트

**Commit:** `docs(phase3): README pages/pipeline section`

**Time:** 30분

---

## Task 14: Phase 3 Retro

**Files:** `docs/plans/phase3-retro.md`

**Step 1 ... Kill gate 체크:**

| Criterion | Threshold | Pass/Fail | Evidence |
|---|---|---|---|
| Astro React 통합 | `@astrojs/react` in config | | `astro.config.mjs` diff |
| 4 page 라우트 | `dist/{,graph/,posts/.../,notes/.../}index.html` | | `ls dist/` |
| 4 island 렌더 | MarkdownView, QAChips, GraphView, BrainPreview | | 수동 브라우저 확인 |
| Fuse.js 검색 | global + page scope 모두 쿼리 시 filter 동작 | | 수동 |
| d3-force graph | 3개 레벨 × 2 모드 = 6가지 상태 toggle | | `?mode=&level=` |
| 한글 slug | Korean slug 페이지 렌더 | | 추가 fixture 필요 시 |
| Tests green | 기존 59 + 신규 5 = 64 | | `bun run test` |
| Build time | `<30s` for 23 pages | | `time bun run build` |
| Bundle size | graph 페이지 JS `<150KB gzip` | | Astro 빌드 출력 |
| TypeScript | 0 error | | `bunx tsc --noEmit` |

**Step 2 ... footgun 기록:** hydration 타이밍 이슈, d3 `.d.ts` mismatch, fetch path (`/graph/...` vs `/meshblog/graph/...` ... gh-pages subpath 이슈는 Phase 4에서 처리)

**Step 3 ... Phase 4로 이관:**
- entity wiki 페이지 (`/wiki/[entity]`)
- concept detail panel
- 404 custom page
- gh-pages subpath 대응 (`astro.config.site` + `base`)
- Fuse.js index를 build time에 pre-build (클라이언트 부트 시간 단축)
- Tailwind 도입 준비 (Phase 5에서 쓸 토큰 구조 결정)

**Commit:** `docs(phase3): add phase3 retro`

**Time:** 30분

---

## Testing strategy (Phase 2 철학 계승)

- **Stage-level smoke > per-component unit.** Phase 2 retro에서 확인된 "59 test 중 유의미한 건 10개 미만" 결론 유지.
- **React component 단위 테스트 드롭.** jsdom + Astro island은 투자 대비 소출 낮음. `build-smoke.test.ts`가 "컴포넌트가 실제로 HTML을 출력함"을 확인.
- **순수 함수 유닛 유지.** `strip-wikilinks.ts` 같은 입출력 명확한 것만 test.
- **통합 테스트 = `bun run build`.** 이게 돌면 90%의 bug 걸림.
- **수동 verification = 첫 클래스 시민.** Dry-run 체크리스트가 공식 게이트.

---

## Dry-run verification (Task 14 실행 전 수동)

Task 0~13 완료 후 retro 쓰기 전에 수동 브라우저 검증.

```bash
bun run build-all
bun run preview # http://localhost:4321
```

**체크리스트:**

1. `/` 열기 → posts 2개, brain preview SVG 노드 8개, QA input 존재, QA 타이핑 시 filter 동작
2. posts 중 하나 클릭 → MD body 렌더, tags 리스트, related 3개, scope=page QAChips
3. related 링크 클릭 → note 상세로 이동
4. 본문에 `[[wiki-link]]` 있으면 plain text로 렌더 (링크 없음)
5. `/graph` 열기 → L1 note 모드 기본, SVG에 노드 + 엣지 렌더
6. Mode=concept 클릭 → fetch `concept-l1.json`, 재렌더
7. Level=3 클릭 → fetch `concept-l3.json`. 노드 수 증가 확인
8. 노드 드래그 → 따라 움직임
9. 노드 클릭 (note 모드) → `/posts/[slug]` 또는 `/notes/[slug]` 이동
10. 브라우저 뒤로가기 → graph 페이지 쿼리파람 유지됨
11. 개발자 도구 → console error 0, network 404 0

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| d3-force SSR 호환성 | High | `client:only="react"` 로 GraphView 격리 |
| 한글 slug Windows/WSL path 이슈 | Med | fixture에 한글 파일명 하나 추가 후 build 확인 |
| `better-sqlite3` Astro build time import 실패 | Med | `vite.optimizeDeps.exclude` 로 피함 |
| Fuse.js initial load | Low | 140 카드 기준 ~5ms |
| react-markdown + rehype-raw XSS | Med | 본인 vault 신뢰. fork 유저 경고 README에 명시 |
| d3 subpackage typings 불일치 | Med | `@types/d3-*` 별도 설치 |
| Astro 6 + React 19 호환성 | Low | 문제 시 react 18 downgrade |
| Graph 렌더 전 FOUC | Med | GraphView 내부 loading fallback |

---

## Open Questions

Phase 3 실행 중 결정 가능한 항목 (지금 블로킹 아님):

1. `public/notes-manifest.json`을 git commit 할지
2. Graph 초기 `level=1` 이 너무 sparse 시 fallback
3. QAChips에서 tier 표시 (`[note]` / `[concept]`) UX clutter 여부
4. GraphView 노드 크기 = pagerank 매핑 scale
5. Concept 모드 노드 클릭 behavior
6. Homepage "brain preview" 디자인 향상

---

**Plan author:** Claude (Opus 4.7) · **Date:** 2026-04-19 · **Approved by:** (pending user)

---

# /autoplan Review Addendum (2026-04-19)

## Phase 1 — CEO Review

**Voices:** `[subagent-only]` (codex unavailable).

### Premises evaluated
1. 방문자 UX가 Phase 3 milestone — VALID
2. 4 island 전부 React 필요 — WEAK (MarkdownView는 Astro-native 가능)
3. Fuse.js threshold=0.4 검색 품질 충분 — **UNEXAMINED (사용자 확인 후 eval fixture 추가)**
4. BrainPreview 비용 ~0 — WEAK (30KB 번들 + 1h, **드롭 결정**)
5. 21 note fixture = 완료 기준 — WEAK
6. Dual graph 차별화 — VALID

### CEO Consensus Table
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Premises valid? | AMBIGUOUS | N/A | DISAGREE → 사용자 결정 반영 |
| Right problem? | PASS | N/A | CONFIRMED |
| Scope calibration? | FAIL | N/A | DISAGREE → BrainPreview 드롭 + OG 스왑 |
| Alternatives considered? | FAIL | N/A | NOTED (Preact/Astro-native 대안 미검토, 수용) |
| Competitive risks covered? | PASS | N/A | CONFIRMED (dual graph + QA chips = 차별자) |
| 6-month trajectory sound? | AMBIGUOUS | N/A | 60% gap 닫음; Phase 5 필수 |

### NOT in scope (CEO 확인)
- Tailwind, 타이포, 컬러, spacing → Phase 5 (유지)
- Entity wiki 페이지 → Phase 4 (유지)
- 404 custom, 애니메이션 → Phase 5 (유지)
- **gh-pages subpath 대응** → Phase 4 (신규 이관: CI 배포 시에만 필요)

### What already exists (leverage map)
- SQLite 9 tables (Phase 2) — `qa_cards`, `notes`, `concepts`, `note_entities`, `concept_entities`
- `public/graph/*.json` 6개 (Phase 2 `export-graph.ts`)
- Volla `knowledge-graph.tsx` 684 lines — **참조만**, 새로 작성

### Error & Rescue Registry (CEO)
| # | Risk | Likelihood | Blast | Rescue |
|---|---|---|---|---|
| E1 | Fuse 검색 recall 저조 | HIGH | PRD 태그라인 붕괴 | **Task 12b eval fixture (신규)** |
| E2 | GraphView FOUC / 레이아웃 점프 | MED | "whoa" 순간이 blank 박스로 | L1 SSR SVG snapshot (Task 6 개선) |
| E3 | 빌드 >100 notes에서 파괴 | MED | 도그푸드 중단 | Task 12 smoke에 시간 budget 로깅 |

### Failure Modes Registry (CEO)
| # | Mode | Addressed? |
|---|---|---|
| F1 | 모바일 cold-load 3-5s TTI | Phase 5로 이연 (수용) |
| F2 | 키보드/스크린리더 nav | Phase 5로 이연 (Patch F4) |
| F3 | `folder_path` 변경 시 링크 silent death | Phase 3 migration 전략 없음 — Phase 4 이관 |

### Dream state delta
**CURRENT** (Phase 2): 파이프라인 OK, 디버그 index만 표시. **THIS PLAN**: 4 페이지 + graph + QA search + 관련 노트 + OG/RSS. **12-MONTH IDEAL**: "HN/트위터 공유 가능" 수준. → **Phase 3로 ~65% 닫힘** (OG 추가로 +5%p), 나머지는 Phase 5 디자인 필수.

### Scope decisions applied (user confirmed)
- **DECISION #1 [P1, P5]**: Task 12b 신규 — `scripts/eval-qa-search.ts` + 20 seed Q→chip, recall ≥70% gate. (+2h)
- **DECISION #2 [P1, P2]**: Task 7 (BrainPreview) 드롭. 신규 Task 7' — `scripts/build-og.ts` + RSS atom.xml 생성. (~1h, net 0)
- **DECISION #3 [P3]**: `gh-pages subpath`, `404 custom`, `link migration` → TODOS.md 이관 (Phase 4).

### CEO Completion Summary
- Mode: SELECTIVE_EXPANSION confirmed
- Premises: 6 evaluated, 1 fixed via Task 12b (#3), 1 fixed via scope swap (#4)
- Scope: +2h eval, -1h BrainPreview +1h OG/RSS = net +2h (~15h total)
- Dual voices: subagent-only; 3/6 CONFIRMED, 3/6 DISAGREE → user-resolved at premise gate
- Critical gaps remaining: none (all CEO findings addressed or explicitly deferred)

**PHASE 1 COMPLETE.** Passing to Phase 2.

---

## Phase 2 — Design Review

**Voices:** `[subagent-only]`.

### Design Litmus Scorecard
| Dimension | Claude | Score | Justification |
|---|---|---|---|
| Information Hierarchy | 5/10 | `/` primary action 모호, notes vs posts 구분 불충분 |
| Interaction States | 3/10 | success path only, loading/error/empty 미명세 |
| Empty States | 4/10 | dev-facing copy, graph empty 누락 |
| Error States | 2/10 | build-time throw만, runtime fetch/hydrate 오류 미처리 |
| Responsive | 3/10 | 전체 Phase 5 이연은 3개 cement 아이템 놓침 |
| Accessibility | 3/10 | landmark O, live region/graph fallback/skip-link X |
| Microcopy | 4/10 | dev 스트링 유출, `lang` 잘못 설정 |
| **Overall** | **4/10** | 구조는 OK, UX 결정 under-spec |

### AUTO-FIX (구조 + 접근성 결정, Phase 3 scope 내 적용)

다음 7개 fix는 "디자인 시스템이 없어도" 결정해야 하는 UX 구조/접근성 항목. Phase 5에서 디자인 시 영향 없이 살아남음.

- **AF1 [Task 8/Base.astro]**: `<html lang={lang}>` prop화. `Base.astro`가 `lang` prop 받고 (default `"ko"`), 각 페이지가 `notes.lang` DB 컬럼(또는 frontmatter `lang:`) 기반으로 전달. fixture에 `lang` 없으면 `ko` default. **DB 스키마 변경 불필요**: runtime에 content 첫 500자에 한글 percent < 10%면 `en` heuristic (소박한 fallback).
- **AF2 [Task 5/QAChips]**: empty state 문구 visitor-facing으로 교체. `"아직 질문이 준비되지 않았습니다. 먼저 글을 읽어 보세요."` dev 힌트는 `console.info('[QAChips] empty — run bun run generate-qa')`.
- **AF3 [Task 6/GraphView]**: SVG 옆에 SSR-rendered `<ul class="sr-only">` 노드 리스트 추가. 각 `<li>`는 `<a href={manifest[id].href}>{label}</a>`. CSS `.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }`. d3 초기화 시 `ul` 유지, 시각적으로만 숨김. 키보드/SR 사용자도 그래프 노드 탐색 가능.
- **AF4 [Task 6/GraphView]**: 3-state loading/error/empty. `const [status, setStatus] = useState<'loading'|'ready'|'error'|'empty'>('loading')`. 각 상태에 visible copy:
  - loading: "그래프를 불러오는 중…"
  - error: "그래프를 불러오지 못했어요. 새로고침 해주세요."
  - empty: "이 레벨에는 아직 연결된 노드가 없어요. L{level+1}을 눌러보세요."
- **AF5 [Task 5/QAChips]**: search input에 inline `style={{ fontSize: '16px' }}` 강제. iOS Safari zoom-on-focus 방지. Phase 5에서 디자인 토큰 도입 시 변수로 승격.
- **AF6 [Task 8/Base.astro]**: `<body>` 최상단에 `<a href="#main" class="sr-only sr-only-focusable">본문으로 건너뛰기</a>`. `<main>`에 `id="main"` 부여. sr-only CSS도 Base.astro `<style is:global>` 3줄로 선언.
- **AF7 [Task 5/QAChips]**: 답변 영역 a11y 강화. `<button aria-expanded aria-controls={'ans-' + q.id}>`, 답변 `<div id={'ans-' + q.id} role="region" aria-live="polite">{q.answer}</div>`. 스크린리더가 펼침/접힘 알림.

### TASTE DECISIONS (Phase 4 gate에서 사용자 결정)

- **T1 [Task 8/index.astro]**: 홈 hierarchy. 현재 "Latest posts 먼저 → Ask the vault 나중" vs "Ask the vault 먼저 → Latest posts 나중". 태그라인("질문하면 답해드립니다")과 맞추려면 QA가 hero 다음에 와야 하지만, 블로그 관성으로는 포스트 먼저. 
- **T2 [Task 10/notes/[slug]]**: Related 컴포넌트 - 현 계획은 `getRelatedNotes` (엔티티 공유) 단독. backlinks (이 노트를 가리키는 다른 노트)를 추가할지, "related" 대신 대체할지. atomic KM 노트의 본질은 backlinks.
- **T3 [Task 6/GraphView]**: 노드 크기/색 인코딩. pagerank → size? type → color (note vs concept)? 지금은 uniform circle. 
- **T4 [Task 8/index.astro]**: 홈 태그라인. 현 "A public second brain that answers questions ... without a server." vs "공개된 두 번째 뇌. 질문을 던지면 글 안에서 답을 찾아드립니다." (user voice 선택).
- **T5 [Task 5/QAChips]**: 긴 답변 overflow 처리. `max-height: 200px + expand` vs 자유 흐름. KM 답변이 3-5단락 나오는 경우 대응.

### DEFERRED TO PHASE 5 (수용)
- Typography scale, color system, spacing, hover/active/focus visual
- Dark mode, 애니메이션
- 완전한 반응형 breakpoint 시스템

### Cross-cutting Findings (severity)
1. [CRITICAL] `lang="ko"` 고정 (AF1 fix)
2. [HIGH] Dev-facing empty copy (AF2 fix)
3. [HIGH] Graph a11y fallback missing (AF3 fix)
4. [HIGH] GraphView loading/error 미명세 (AF4 fix)
5. [MEDIUM] iOS zoom on QA input (AF5 fix)

**Design dual voices:** subagent-only, 7/7 CONFIRMED auto-fix, 5 TASTE decisions surfaced to Phase 4.

**PHASE 2 COMPLETE.** Passing to Phase 3.

---

## Phase 3 — Eng Review (2026-04-19)

**Voices:** `[subagent-only]` (codex CLI unavailable per `which codex` = empty).
**Test plan artifact:** `/home/qkdwodus777/.gstack/projects/meshblog/qkdwodus777-main-test-plan-20260419-0030.md`

### A. Architecture Diagram

```
                           meshblog Phase 3 — Static Pipeline
                           ==================================

  content/                           scripts/                              .data/ + public/
  --------                           ---------                             ----------------
  posts/       ─┐                                                       
    01-*.md     │   ┌─► build-index.ts ──────────────────────────────►  .data/index.db
    02-*.md     │   │   (MD+frontmatter → notes table,                     (9 tables:
  notes/        ├──►│    entity extract, hash skip)                         notes,entities,
    *.md × 21   │   │                                                       note_entities,
  _drafts/      │   ├─► generate-qa.ts (claude CLI, tier=note/concept/      concepts,
    (skipped)   │   │    global) ─────────────────────────────────────►     concept_entities,
                │   │                                                       qa_cards,
                │   ├─► export-graph.ts (louvain comm, pagerank) ────►      note_embeddings)
                │   │                                                       
                │   ├─► build-manifest.ts (NEW, Task 3)  ────────────► public/notes-manifest.json
                │   │                                                       
                │   ├─► build-og.ts (NEW, Task 7' / AF via resvg) ───► public/og/<path>.png
                │   │                                                       
                │   └─► build-rss.ts (NEW, Task 7') ──────────────────► public/atom.xml
                │                                                       
                │   ┌── eval-qa-search.ts (NEW, Task 12b, CI gate)         public/graph/
                │   │                                                       note-l{1,2,3}.json
                │   │                                                       concept-l{1,2,3}.json
                ▼   ▼                                                   
         ┌─────────────────────────────────────────────────────────┐
         │                Astro 6.1.7 build (static)                │
         │     src/pages/*.astro ──► readonly SQLite @ build time   │
         │                                                          │
         │  ┌─ index.astro                (Base.astro layout)       │
         │  ├─ posts/[slug].astro         getStaticPaths → 2 pages  │
         │  ├─ notes/[slug].astro         getStaticPaths → 21 pages │
         │  └─ graph.astro                 1 page                    │
         │                                                          │
         │  React islands (@astrojs/react, React 19):                │
         │  ┌─ MarkdownView   client:load       (posts + notes)     │
         │  ├─ QAChips        client:visible    (home + detail)     │
         │  └─ GraphView      client:only=react (/graph)            │
         │     ~~BrainPreview DROPPED per CEO Decision #2~~         │
         └─────────────────────────────────────────────────────────┘
                              │
                              ▼
                            dist/                    
                            ─────
                            index.html
                            graph/index.html + *.json (copied)
                            posts/<slug>/index.html × 2
                            notes/<slug>/index.html × 21
                            notes-manifest.json
                            atom.xml
                            og/*.png
                            _astro/*.js (hydration bundles)
```

**Data-flow assertion:** SQLite is **read-only at Astro build** (`openReadonlyDb()` uses `{readonly:true, query_only=ON}`). No runtime DB. Client islands fetch only static JSON from `public/`. This matches PRD §4 "static-only" and is architecturally clean.

### B. Test Diagram (existing → Phase 3 additions)

**Existing** (`scripts/__tests__/`, verified via `ls`):
```
build-index.test.ts       (smoke + idempotency — 2 cases)
claude-code.test.ts       (claude CLI wrapper)
cosine.test.ts            (embedding math)
embed-blob.test.ts        (blob codec)
export-graph.test.ts      (graph JSON shape)
generate-qa.test.ts       (3-tier FAQ)
porting-rules-lint.test.ts
schema-fk-type-lint.test.ts
```
8 files / ~59 passing, all pure Node/TS (no jsdom, no browser).

**Phase 3 plan adds:**

| Test file | Covers | Tasks | Status in plan |
|---|---|---|---|
| `scripts/__tests__/page-data.test.ts` | `src/lib/pages/*` (db opener, list/get, Qa, related) | 1 | specified |
| `scripts/__tests__/slugs.test.ts` | Korean slug encode round-trip | 4, 9, 10 | specified |
| `scripts/__tests__/markdown-render.test.ts` | `stripWikilinks` pure fn | 2 | specified |
| `scripts/__tests__/graph-json-manifest.test.ts` | manifest + graph JSON schema | 3 | specified |
| `scripts/__tests__/build-smoke.test.ts` | end-to-end `bun run build` (dist files) | 12 | specified, slow (180s) |
| `scripts/eval-qa-search.ts` (standalone) | Fuse recall@3 ≥ 70% | 12b | specified |

**Gaps identified:**
1. **No test for `scripts/build-og.ts` / `scripts/build-rss.ts`** — Task 7' is specified but has no test file. Gap → recommend adding `scripts/__tests__/og-rss.test.ts` (PNG magic-byte check + atom.xml shape regex). 5–6 assertions, 15 min cost.
2. **No a11y smoke** — AF3/AF6 `sr-only` landmarks can silently regress. Recommend one line inside `build-smoke`: `expect(html).toMatch(/class=["']sr-only/)`.
3. **No bundle-size gate** — kill-gate "graph page < 150KB gzip" is check-by-eye only. Recommend `scripts/check-bundle-size.ts` reading `dist/_astro/*.js` sizes.
4. **No existing test needs updating.** Phase 2's 8 tests touch only `src/lib/db/`, `src/lib/rag/`, `src/lib/card/` — Phase 3 adds `src/lib/pages/` + `src/lib/markdown/` as new subdirs. Zero churn on existing assertions.

(Full matrix in test plan artifact.)

### C. Failure Modes Registry

| # | Mode | Trigger | Blast | Detection | Mitigation |
|---|---|---|---|---|---|
| FM1 | OG resvg native binding missing on linux CI | `bun add @resvg/resvg-js` installs macOS binary on dev, Linux CI has no prebuild | `build-og.ts` throws, whole build fails | Task 7' smoke test fails in `.github/workflows/deploy.yml` | Pin `@resvg/resvg-js` version w/ linux-x64 optional dep; add fallback to `satori` + `@resvg/resvg-wasm` (pure JS) as documented alt |
| FM2 | OG template font not found | resvg needs font bytes for non-ASCII; default Helvetica lacks CJK | Korean post titles render as `□□□` in PNG | Visual check on first CI run | Bundle Noto Sans KR subset in `scripts/og-assets/` (~500KB); load via `resvg` `font` option |
| FM3 | Astro `getStaticPaths` + Korean slug URL encoding mismatch | `notes.slug` stored as raw `"01-글쓰기-패턴"` but Astro writes dir as `01-%EA%B8%80…` on some OS | Broken link: href=`/notes/01-글쓰기-패턴/` but file at `/notes/01-%EA%B8%80…/index.html` | Plan Task 4 slugs.test.ts + integration smoke on fixture w/ CJK slug | Always pass raw slug to `params`, apply `encodeURIComponent` only in href strings; Astro 6 writes percent-encoded dirs consistently since 4.x — verify at Task 9/10 |
| FM4 | d3-force non-deterministic layout | `Math.random()` seeds force sim; node coords differ per build | Cosmetic only; no functional break. But any future snapshot test fails. | No current test catches this | Seed d3 via `simulation.randomSource(() => 0.5)` or skip (document: graph is intentionally ephemeral) |
| FM5 | FOUC on MarkdownView `client:load` | SSR renders article but React rehydrates over it; during hydration window, interactive state is dead | ~100ms flash on slow devices | Manual check only | `client:load` SSR matches DOM → minimal FOUC; plan is acceptable. Flag for Phase 5 measurement |
| FM6 | GraphView large-graph FPS | L3 graph at 200+ notes, d3-force continuous tick | Laggy drag, tab unresponsive | Phase 5 benchmark | Plan C3: `simulation.stop()` after 60 ticks pre-compute; acceptable for fixture |
| FM7 | QAChips `aria-live="polite"` buffer spam | User types fast, 5 answers open/close rapidly | Screen reader reads answer text repeatedly | Manual SR test | AF7 already scopes `aria-live` to each answer region (not the list); safe. But consider `aria-live="off"` on list, `polite` only on expanded answer — plan matches |
| FM8 | Fuse.js recall degradation >100 notes | Index grows; threshold=0.4 sweet spot narrows | Top-3 misses real answers | **Task 12b eval gate** catches drift iff seed kept current | Add seed-update checklist in `/new-post` skill: when adding new high-visibility content, add 1–2 eval seeds |
| FM9 | `better-sqlite3` native binding at Astro build time | Astro SSR tries to import native module in Vite; already known footgun | Build dies at `getStaticPaths` | Task 0 exit criteria: `bun run build` green | `vite.optimizeDeps.exclude: ['better-sqlite3']` per plan Task 0 — correct. Also verify Vite `ssr.noExternal` does NOT include sqlite |
| FM10 | claude CLI missing on CI → `generate-qa` fail → `qa_cards` empty | GitHub Actions default runner has no claude | QAChips show empty state everywhere (graceful), eval gate fails | Plan pre-conditions allow empty `qa_cards` ... but eval gate breaks | **Resolve:** commit `.data/index.db` fixture snapshot for CI (Option A in test plan §4) OR skip eval on CI until Phase 4 |
| FM11 | `rehype-raw` + author-injected `<script>` | Any fixture MD author adds `<script>` | XSS executes in reader's browser | Manual review of fixture content | Trusted-author model (author == reader ~= owner). Document in README: "fork users must sanitize or drop rehype-raw". Acceptable single-user risk |
| FM12 | `.data/index.db` committed to public repo | Dev runs `git add -A`, DB has note embeddings (may echo API usage) | Minor: DB has no secrets but reveals internal structure | Gitignore review | `.gitignore` already excludes `.data/` — verified. Add CI check? Optional |

### D. N+1 / Perf Analysis

| Surface | Risk | Verdict |
|---|---|---|
| `getStaticPaths` + per-page SQLite reads | 23 pages × ~5 queries each = **~115 queries per build**. Better-sqlite3 is synchronous + in-process, prepared statements cached. At 1 μs/query ≈ 0.1ms total. **Zero N+1 problem.** | OK |
| Re-opening DB per page | Each `posts/[slug].astro` calls `openReadonlyDb()` in frontmatter. 23 opens. Better-sqlite3 DB open ≈ 1ms. Total ≈ 23ms. | OK, but **minor optimization:** hoist to module-level singleton in `src/lib/pages/db.ts` (fire-and-forget close at process exit). Saves 22ms, cleaner. Recommend. |
| d3-force tick budget | 21 notes × 60 ticks = fast (~50ms). L3 at 200 notes = ~400ms. Plan pre-computes, stops. | OK for Phase 3 scope. Flag for Phase 5 |
| Fuse.js index size | 140 cards × `question+answer` ≈ 20KB raw → Fuse sorted-array index ≈ 80KB memory / ~8KB gzip bundle inline. 2000 cards scales to ~120KB gzip — still fine. | OK up to ~5k cards |
| OG generation resvg cost | resvg SVG→PNG ≈ 50ms each. 23 posts+notes + 1 home = 24 × 50ms = **1.2s serial**. | OK. Parallelize only if build-og dominates (>10s). Phase 5 problem |
| RSS regen on every build | atom.xml generated from 2 posts (currently). Plain string build, <5ms. | Trivially OK. Incremental not needed |
| Graph JSON re-emit | `export-graph.ts` recomputes 6 JSON files every `build-all`. Louvain + pagerank ~200ms for 21 nodes. | OK. Phase 5 consider Make-style timestamp skip |
| `getRelatedNotes` SQL | 3-way join with GROUP BY, runs per detail page = 23×. ~1ms each. | OK. Index on `note_entities(note_id)` + `(entity_id)` already implied by FK; verify at Task 1 |

**Overall:** no P0 perf issue. One polite recommendation: singleton DB handle in `src/lib/pages/db.ts`.

### E. Security / Privacy

| Concern | Analysis | Action |
|---|---|---|
| `rehype-raw` XSS surface | Enabled per plan Task 4. Trusted author model. | Document in README §Security. Acceptable for single-user vault. Fork warning per existing Risks table. |
| `.env` / API keys leaking to client bundle | Astro only inlines `PUBLIC_*` env vars. `OPENAI_API_KEY` has no prefix → never inlined. Code never imports `process.env.OPENAI_API_KEY` from a `src/components/*.tsx` file. | Verify at Task 0: grep `process.env` in `src/components/` and `src/pages/` — must find 0 matches referencing secrets |
| `.data/index.db` public repo exposure | `.gitignore` has `.data/` — verified. No secrets in DB (embeddings are API derivatives, not keys). | OK |
| Note embeddings privacy | `note_embeddings` table holds 1536-dim floats derived from note content. Cannot be committed to public repo (leaks content via invertibility? No, embeddings are lossy). Still, DB file not committed. | OK |
| Graph JSON exposure | `public/graph/*.json` contains node labels = note titles + concept names. **By design public.** | OK |
| Fuse client bundle contains QA answers | `public/` static files readable by anyone via DevTools. Expected — site is public. | OK |
| `public/notes-manifest.json` href paths | Lists all note slugs (including unpublished? No — plan Task 3 filters none, but `folder_path='/_drafts'` notes aren't in DB due to Phase 1 skip). | OK. If Phase 4 adds drafts to DB, revisit manifest filter |
| CI secrets in `deploy.yml` | Current workflow references `OPENAI_API_KEY` as `secrets.OPENAI_API_KEY`. Correct pattern. | OK. Phase 4 may add claude CLI — plan now |

**Security action items for Phase 3:**
1. Add grep-based precommit or test assertion: no `process.env.OPENAI_*` in `src/components/` or `src/pages/`.
2. Document trusted-author XSS model in README (1 paragraph).

### F. Deployment / Error Paths

**GitHub Actions matrix (current `deploy.yml`):**
- ubuntu-latest, bun latest
- `bun install --frozen-lockfile` → requires `bun.lock` committed (verified, 97KB)
- `bun run build` → builds Astro **WITHOUT** running `build-all`, i.e., without regenerating `.data/index.db`, `public/graph/*.json`, `public/notes-manifest.json`, `public/og/*`, `public/atom.xml`

**Critical deployment gap:** `deploy.yml` currently runs only `bun run build`. Phase 3 makes this insufficient. Two possibilities:

1. **Commit generated artifacts** (`public/graph/*.json`, `public/notes-manifest.json`, `public/og/*.png`, `public/atom.xml`) — fastest, content-change triggers regen locally
2. **Run `bun run build-all` in CI** — requires:
   - `OPENAI_API_KEY` secret (already set) for embeddings in `build-index`
   - claude CLI for `generate-qa` — **not available** on GitHub runners
   - Net cost: ~$0.05 per build for embeddings; QA gen skipped (degrades to empty QAChips) OR commit qa_cards snapshot

**Recommendation:** Phase 3 ships with `deploy.yml` updated to:
```yaml
- run: bun run build-index      # needs OPENAI_API_KEY, cheap
- run: bun run export-graph      # pure compute
- run: bun run build-manifest    # DB read
- run: bun run build-og          # resvg
- run: bun run build-rss         # DB read
# NOT: generate-qa (skip on CI until Phase 4 resolves claude CLI)
- run: bun run build             # Astro
```
QAChips degrades to "empty" on CI-built site unless user runs `generate-qa` locally and commits the DB. This is a **Phase 3 CI story gap** — flag to user as Phase 4 deferrable or address now.

**Error paths during build:**

| Error | Phase 3 behavior | OK? |
|---|---|---|
| `generate-qa` fails mid-build (API 429, timeout) | `qa_cards` partially populated; QAChips shows whatever exists + empty fallback | OK — graceful |
| `build-og` throws (FM1) | Hard fail → CI red | Needs fallback try/catch: write placeholder PNG if resvg fails, log warning, continue |
| `build-manifest` on empty DB | Current plan Task 3: `if (!db) process.exit(1)`. | **Change to warn-and-continue:** write `public/notes-manifest.json = {}`, print warning. Preserves partial build for CI fresh-clone case |
| `getStaticPaths` on no-DB | Plan: return `[]`. Astro builds 0 detail pages silently. | Degraded-but-builds. Acceptable. |
| Claude CLI missing locally | `bun run generate-qa` exits with message. `build-all` chain stops. `build` still runs with stale `qa_cards`. | OK, expected |

### G. Test Plan Artifact → filed separately

Written to `/home/qkdwodus777/.gstack/projects/meshblog/qkdwodus777-main-test-plan-20260419-0030.md`:
- Unit test matrix (file × function × case) — 5 files, ~30 assertions
- Integration test matrix — 1 file, 10 cases + 3 recommended
- Eval harness (recall@3 ≥ 70%)
- CI gate definition w/ unresolved-dependency list

### H. Dual-Voices Consensus (subagent-only)

`codex` CLI unavailable (`which codex` → empty). Consensus below is subagent-only. User: re-run Phase 3 review with `codex` available for second voice when possible.

| Dimension | Subagent Position | Confidence | Tag |
|---|---|---|---|
| Architecture | Static-only + island pattern + readonly SQLite at build = clean. Singleton DB handle would save 22ms. BrainPreview drop was correct; no arch concern. | HIGH | `[subagent-only]` |
| Tests | 5 planned unit files + 1 integration smoke + 1 eval = appropriate pyramid for static-site scope. **Gaps:** no OG/RSS test (Task 7'), no a11y smoke (AF3/AF6), no bundle-size gate. Recommend adding all 3 (~45min total cost). | HIGH | `[subagent-only]` |
| Perf | No N+1. ~115 queries/build ≈ 0.1ms. d3-force 60-tick pre-compute correct. OG resvg 1.2s serial acceptable. | HIGH | `[subagent-only]` |
| Security | Trusted-author XSS model OK single-user; document in README. No client-side secrets if grep passes. `.data/` gitignored verified. | MEDIUM-HIGH | `[subagent-only]` |
| Error paths | Most paths graceful-degrade. Two fixes needed: `build-og` wrap in try/catch w/ placeholder; `build-manifest` warn-and-continue on empty DB. | HIGH | `[subagent-only]` |
| Deployment | **WEAK.** `deploy.yml` runs only `bun run build`, skipping Phase 3 artifact generation. Must update to chain `build-index` + `export-graph` + `build-manifest` + `build-og` + `build-rss` before `build`. `generate-qa` on CI unresolved (claude CLI). | LOW → needs fix | `[subagent-only]` |

**Consensus:** 4/6 HIGH confidence, 1/6 MEDIUM, 1/6 requires action pre-Phase 4.

### Eng-Review Decisions (proposed, pending user acceptance)

- **ED1 [Deployment]**: Update `.github/workflows/deploy.yml` to run `build-index && export-graph && build-manifest && build-og && build-rss && build`. Skip `generate-qa` on CI (Phase 4 resolve). Commit `.data/index.db` fixture OR accept empty QAChips on CI site. Time: 30min.
- **ED2 [Tests]**: Add `scripts/__tests__/og-rss.test.ts` (5 cases, ~15 min).
- **ED3 [Tests]**: Add a11y smoke assertion inside `build-smoke.test.ts` (1 line, 2min).
- **ED4 [Tests]**: Add `scripts/check-bundle-size.ts` + npm script (budget 150KB for graph page bundle). Time: 30min.
- **ED5 [Perf/Code]**: Make DB handle a module-level singleton in `src/lib/pages/db.ts` with `process.on('exit', () => db.close())`. Saves 22ms build, cleaner than per-page open/close. Time: 15min.
- **ED6 [Error path]**: Wrap `build-og.ts` main in try/catch, write placeholder 1×1 PNG on resvg failure. Wrap `build-manifest.ts` to write `{}` if DB missing. Time: 15min.
- **ED7 [Security]**: Add README `## Security` paragraph (3 lines) documenting trusted-author rehype-raw model. Time: 10min.

**Total ED impact:** +~2h, net new test file + CI hardening + 3 small code hardening edits.

### Phase 3 Completion Summary

- Mode: Eng Review, subagent-only
- Architecture: clean, BrainPreview drop reinforced as correct call
- Tests: 5 planned + 3 recommended gaps (og-rss, a11y smoke, bundle-size)
- Perf: no N+1, one 22ms optimization flagged
- Security: trusted-author model OK; grep-check for client-side secrets needed
- Error paths: 2 hardening fixes flagged (ED6)
- Deployment: **action required** — `deploy.yml` must chain full artifact build (ED1)
- 7 ED items surfaced; none blocking Phase 3 implementation but 1 blocking Phase 3 **deployment**

**PHASE 3 COMPLETE.** Passing to Phase 3.5.

---

## Phase 3.5 — DX Review (2026-04-19)

**Voices:** `[subagent-only]` (codex CLI unavailable). Lens: single-user personal site; "DX" = "future-me DX, 6 months from now after context loss."

### 1. TTHW (Time To Hello World)

Target: clean clone → running site with fake content in <5 min. Walking the current README + Phase 3 plan:

```
git clone … && cd meshblog         # 5s
bun install                         # 30-60s (bun.lock present)
bun run setup                       # 2s  (.env.local + .data/ dirs)
# edit .env.local: add OPENAI_API_KEY   <-- FRICTION 1: blocked until key
bun run build-index                 # 10-30s (embeddings network)
bun run generate-qa                 # 30-120s (needs claude CLI auth)  <-- FRICTION 2
bun run export-graph                # 2s
bun run build-manifest              # 1s   (Phase 3 new)
bun run build-og                    # 2-5s (Phase 3 new, native binding)  <-- FRICTION 3
bun run build-rss                   # <1s  (Phase 3 new)
bun run build                       # 10-30s
bun run preview                     # up
```

**Realistic TTHW with keys ready + claude CLI authed: ~3 min.**
**Realistic TTHW cold (no key, no claude): 15-30 min** (signup, billing, auth flow).

Friction summary:
- **F1 (blocker):** `OPENAI_API_KEY` required. README says it plainly but does not say "you can skip this and still see pages render" — there is no "fixture-only" path. Future-me after context loss will stall.
- **F2 (blocker):** `generate-qa` requires local claude CLI. No skip switch. QAChips are the headline feature; if claude is missing, future-me doesn't know whether he should proceed or debug.
- **F3 (silent):** `build-all` chain grows to 6 steps in Phase 3. If step 4 (`build-og`) fails due to FM1 (resvg native binding), user loses context on which step failed. No `build-all-safe` variant.
- **F4 (missed):** README `Setup` section is Phase 1 vintage — does not mention `build-manifest`, `build-og`, `build-rss`. Task 13 updates README Pages+Pipeline section but `Setup` block stays stale. **First impression drift.**

### 2. Developer Journey

| Stage | Friction 1-10 | Notes |
|---|---|---|
| Clone + install | 2 | `bun install` fast, no known hazard |
| First content add (new note) | 3 | Drop MD into `content/notes/`. `/new-post` skill planned but not in Phase 3 scope. No template/example visible. |
| Run `build-index` | 4 | Good error messages (README §Troubleshooting). Still requires OpenAI key; no "skip embeddings" toggle |
| Run `generate-qa` | 6 | Requires authed claude CLI. If missing → plain "command not found". No fallback/skip flag |
| Run `export-graph` | 2 | Pure compute; rarely fails |
| Dev preview | 3 | `bun run dev` works; but Phase 3 pages fetch `/graph/*.json` + `/notes-manifest.json` — dev server serves from `public/` so fine, iff those files were generated first. Not documented |
| Deploy | 8 | Phase 2 `deploy.yml` runs only `bun run build` — Phase 3 artifacts missing on CI. ED1 must land or site deploys stale/broken |
| Debug broken build | 7 | Astro + better-sqlite3 + vite-ssr + native resvg — 4 error surfaces. No `DEBUG=*` convention. Plan ED6 wraps `build-og`/`build-manifest` but silent log line only |
| Rollback | 5 | Astro site → git revert the commit. But `.data/index.db` is gitignored, so rebuild required. If commit included a content edit that broke index extraction, `git revert` + `bun run build-all` = working state. No explicit rollback doc |

### 3. DX Dimensions (1-10, 10 = great)

1. **Discoverability — 6/10.** `package.json` scripts are named well (`build-index`, `generate-qa`, `export-graph`, `build-all`). Plan adds `build-manifest`, `build-og`, `build-rss`, `eval-qa`. At 9+ scripts, a `bun run` with no args shows them but there is no grouping. Future-me will `cat package.json` to remember.
2. **Error surfaces — 5/10.** `build-index` has reasonable retry + logged file path. `generate-qa` is opaque (Phase 2 retro). Phase 3 new scripts (ED6 fix) will catch but only log. `getStaticPaths` throws a terse `Error: Post not found: <slug>` from Task 9 — stack trace swallowed by Astro's builder unless verbose.
3. **Resume-ability — 3/10.** `build-index` has hash-skip (idempotent). `generate-qa` has no documented `--resume-from`. `export-graph` is pure recompute. If `build-all` dies at step 5 of 6, you cannot skip-forward; must re-run from scratch or re-run individual scripts in order (which works, but isn't documented).
4. **Local dev vs CI parity — 3/10.** **Major gap.** CI runs only `bun run build`. Local runs `build-all` + `build`. These produce different sites. Phase 3 Eng Review ED1 flags; must land.
5. **Cost feedback loop — 4/10.** OpenAI embeddings cost ~$0.02 per full index (21 notes × 1536-dim). Never logged. `generate-qa` uses local claude subscription (no per-call cost) — but user has no token counter. At 21 notes, each `bun run build-all` silently spends ~$0.02 + claude session quota. Not ruinous; but 100-note dogfood scales badly without a `[cost] $X.XX` log line.
6. **Context recovery after 6 months — 6/10.** README is solid for Phase 1 commands. Phase 3 plan itself (this file, 1700 lines) is the spec — future-me can re-read. But `docs/plans/phase3-retro.md` (Task 14) is where the "why" lives. If only README exists, dev won't find the plan. Recommend: README links to `docs/plans/`.
7. **Change safety — 5/10.** Edit a note → `bun run build-index` (skips unchanged). But: did entities change? Concepts? qa_cards? Graph? The mental model "what regenerates when I edit one note" is undocumented. A `bun run refresh <file>` or clear rule ("editing one note → rerun build-all to be safe") missing.
8. **Guardrails — 4/10.** `.gitignore` excludes `.data/` and `dist/`. But `public/graph/*.json`, `public/notes-manifest.json`, `public/og/*.png`, `public/atom.xml` — are they committed? Plan Task says "defer". Without a rule, half the artifacts will drift. No pre-commit hook verifying "don't commit broken DB / stale graph / mismatched QA." Eng Review ED1 asks deploy question; DX question is bigger: **what's the source of truth for public/ artifacts?**

### 4. Empathy Narrative (6 months from now)

> It's October. I open VS Code in `~/projects/meshblog`. I want to add a note about Zig coroutines. I type `bun run new-post` — no such script. I grep `package.json`. There's `build-index`, `generate-qa`, `build-all`. I remember: just drop MD in `content/notes/`. I write `02-zig-coroutines.md`, hit save. Now what? I run `bun run build-all`. It stalls on `generate-qa` — claude CLI says "not authenticated". I groan, run `claude login`. Re-run. Works. Now `build-og` — error: "libresvg.so: cannot open shared object file". I stare. I find `docs/plans/2026-04-19-meshblog-phase3.md` line 1570, FM1. I switch to the wasm fallback. Re-run. Finally green. `bun run build && bun run preview`. My note is there. Graph shows it. QAChips finds "what are zig coroutines?". Flow state. **Total: 25 min for what should be 2.**

### 5. DX Gap Table

| # | Gap | Severity | Fix cost | Action |
|---|---|---|---|---|
| G1 | No `bun run build-all:safe` that continues past step failure with warnings | HIGH | 10min | AUTO-FIX Task 0 |
| G2 | README `Setup` block doesn't list Phase 3 new scripts (`build-manifest`, `build-og`, `build-rss`, `eval-qa`) | HIGH | 10min | AUTO-FIX Task 13 |
| G3 | No "skip LLM / fixture-only" path — new contributor / future-me w/o keys is blocked | HIGH | 30min | SURFACE (taste T6) |
| G4 | No cost log line (`[cost] embeddings $0.02`) in `build-index` | MEDIUM | 15min | AUTO-FIX Task 0 or Task 14 |
| G5 | Dev-vs-CI parity gap (covered by ED1, re-emphasized here) | CRITICAL | 30min | already in ED1 |
| G6 | Public/ artifact commit policy undecided (graph JSON, manifest, og PNGs, atom.xml) | HIGH | 15min decision + gitignore tweak | SURFACE (taste T7) |
| G7 | No `docs/plans/` link from README | LOW | 2min | AUTO-FIX Task 13 |
| G8 | No "what regenerates when I edit file X" map | MEDIUM | 20min | AUTO-FIX Task 13 (small table) |
| G9 | `generate-qa` missing `--skip-on-missing-cli` flag for CI/future-me | MEDIUM | 20min | DEFER (Phase 4 w/ claude CLI CI story) |
| G10 | No `bun run doctor` that checks claude CLI, OPENAI_API_KEY, `.data/index.db` existence, fixture note count | MEDIUM | 30min | SURFACE (taste T8) or Task 14 |
| G11 | No rollback story for when `.data/index.db` gets corrupted mid-build | LOW | 10min (doc) | AUTO-FIX Task 13 (1 paragraph) |
| G12 | No example/template `content/notes/_template.md` for future-me | LOW | 5min | AUTO-FIX Task 13 |

### 6. Auto-fixes vs Deferred

**AUTO-FIX NOW (≤15 min each, slot into Task 0 or Task 13):**
- **AF-DX1 [Task 0]**: Add `"build-all:safe": "bun run build-index || true; bun run generate-qa || true; bun run export-graph && bun run build-manifest && bun run build-og || true; bun run build-rss"` — continues past optional LLM steps. (~10min)
- **AF-DX2 [Task 13]**: Update README `Setup` block to include Phase 3 scripts + link to `docs/plans/2026-04-19-meshblog-phase3.md`. (~10min)
- **AF-DX3 [Task 0 or Task 13]**: Add `[cost]` log line in `build-index.ts` after embeddings loop. 1 console.log with estimate. (~15min)
- **AF-DX4 [Task 13]**: Add small "What regenerates" table to README (note edit → build-index → build-manifest → build-og → build; concept edit → export-graph also). (~15min)
- **AF-DX5 [Task 13]**: Ship `content/notes/_template.md` fixture-template with frontmatter schema comments. (~5min)
- **AF-DX6 [Task 13]**: Add short "Rollback" subsection in README Troubleshooting. (~10min)

**SURFACE FOR TASTE DECISION (Phase 4 gate):**
- **T6 [DX]**: Do we ship a `FIXTURE_ONLY=1` mode that skips OpenAI + claude, seeds 3 canned notes + canned `qa_cards.json` so future-me / forkers get pages on first clone with zero keys? (Cost: ~2h. Pays off on every onboarding.)
- **T7 [DX]**: Commit policy for `public/graph/*.json`, `public/notes-manifest.json`, `public/og/*.png`, `public/atom.xml` — commit all (makes CI trivial, grows repo slowly); commit none (CI regenerates every deploy); commit only graph+manifest (small) and regen og+rss on CI (current lean toward this). **User must choose now** because `.gitignore` wording blocks Phase 3 closeout.
- **T8 [DX]**: `bun run doctor` preflight — worth 30min now vs defer? Single-user, so ROI is thin; but future-me after context loss benefits.

**DEFER TO TODOS / Phase 4:**
- G9 (`--skip-on-missing-cli` flag) — couples to Phase 4 CI claude-CLI resolution.
- T8 if not chosen above.

### 7. Dual-Voices Consensus (`[subagent-only]`)

| DX dimension | Position | Confidence | Tag |
|---|---|---|---|
| Discoverability | Adequate with AF-DX2 + AF-DX4 landed. Without them: poor. | MEDIUM | `[subagent-only]` |
| Error surfaces | ED6 (Phase 3 Eng) fixes the two worst offenders. Still no log-level convention. | MEDIUM | `[subagent-only]` |
| Resume-ability | `build-index` hash-skip is the only resume hook. Acceptable for 21-note dogfood; revisit at 100+ notes. | MEDIUM-HIGH | `[subagent-only]` |
| Local/CI parity | CRITICAL gap; ED1 must land to close. | HIGH | `[subagent-only]` |
| Cost feedback | Missing. AF-DX3 fixes cheaply. | HIGH | `[subagent-only]` |
| Context recovery | Strong if README links `docs/plans/`. AF-DX2. | HIGH | `[subagent-only]` |
| Change safety | Weak mental model. AF-DX4 table helps. Real fix = `bun run refresh <file>` skill (Phase 4). | MEDIUM | `[subagent-only]` |
| Guardrails | T7 decision unblocks. Without it, silent drift likely. | HIGH | `[subagent-only]` |

**Consensus:** 4/8 HIGH confidence, 3/8 MEDIUM. All P0 gaps addressable via 6 auto-fixes (~70 min total) + 3 taste decisions (T6/T7/T8). No blocker for Phase 3 implementation; **T7 blocks Phase 3 deployment closeout** alongside Eng Review ED1.

### 8. Phase 3.5 Completion Summary

- Mode: DX Review, single-user lens, `[subagent-only]`
- TTHW: 3 min warm, 15-30 min cold (keys + claude CLI)
- 9-stage journey: worst friction at Deploy (8/10) and Debug (7/10) — both downstream of Eng ED1 + DX T7
- 8 dimensions: 4 HIGH, 3 MEDIUM confidence
- 12 gaps catalogued: 6 AUTO-FIX (~70min), 3 TASTE (T6/T7/T8), 2 DEFER, 1 already-in-ED1
- Top-3 gaps to surface for Phase 4 final gate: **T7 (artifact commit policy), T6 (fixture-only mode), G5/ED1 (CI parity)**

**PHASE 3.5 COMPLETE.** Passing to Phase 4 final approval gate.

---

## Phase 4 — Final Approval Gate (2026-04-19)

All 3 reviews complete. User presented with 4 decisions via AskUserQuestion. All 4 recommended options accepted.

### Decisions logged

| ID | Decision | Choice | Impact |
|----|----------|--------|--------|
| **T7** | Artifact commit policy | **CI regenerate, gitignore all** | `.gitignore` += `public/graph/`, `public/og/`, `public/atom.xml`, `public/notes-manifest.json`, `.data/`. `deploy.yml` must chain `build-index → generate-qa → export-graph → build-og → build-rss → astro build`. Resolves Eng ED1. |
| **T6** | FIXTURE_ONLY mode | **Ship in Phase 3** | Add **Task 0.5** before Task 1: `FIXTURE_ONLY=1` env flag seeds canned notes + qa_cards, skips OpenAI/claude CLI. ~2h. Unblocks zero-key clone-and-run. |
| **T1** | Homepage hierarchy | **Posts-first, QA secondary** | `index.astro` hero = latest 5 posts with excerpt. QA chips = 'Explore the graph' section below. Resolves taste T1 for Task 8. |
| **Gate** | Execution | **Approved — start Task 0 now** | Proceed to implementation. Roll AF1-AF7 + AF-DX1-6 + ED6/ED7 + above into Task 0 prerequisites. |

### Task list updates (carried into implementation)

1. **Task 0** grows: baseline setup + AF1-AF7 (Design auto-fixes) + AF-DX1-6 (DX auto-fixes) + ED6 (try/catch wrappers) + ED7 (README XSS note) + T7 gitignore + T7 workflow chain.
2. **Task 0.5 NEW:** FIXTURE_ONLY mode. Env-gated path seeds `.data/index.db` from `test/fixtures/seed.sql`, populates canned qa_cards. `bun run build:fixture` runs astro build with zero API calls.
3. **Task 7'** (OG + RSS) — ED6 try/catch required, no test file → add to `test/build-og.test.ts` + `test/build-rss.test.ts`.
4. **Task 8** index.astro — follow T1 posts-first layout.
5. **Task 12b** QA search eval (already added) — CI gate recall@3 ≥70%.
6. **Task 14** (deploy) — T7 workflow chain, smoke-test CI artifact presence.

### Consensus summary (dual-voices, subagent-only)

Codex unavailable throughout → all 3 phases tagged `[subagent-only]`. 

| Phase | Subagent confidence | Outstanding risks |
|-------|---------------------|-------------------|
| CEO | HIGH | Scope fixed, premises confirmed with 3 DISAGREE handled |
| Design | MEDIUM-HIGH | 5 taste decisions resolved (T1 just answered; T2-T5 Task 8-time) |
| Eng | HIGH on architecture, MEDIUM on deployment | ED1 addressed via T7. `generate-qa` on CI without claude CLI → skip-if-missing fallback in workflow |
| DX | HIGH on TTHW post-Task 0.5, MEDIUM on context recovery | Future-me docs refresh part of AF-DX2 |

### Autoplan completion criteria

- [x] Phase 1 CEO Review — completed 2026-04-19
- [x] Phase 2 Design Review — completed 2026-04-19
- [x] Phase 3 Eng Review — completed 2026-04-19 (test plan artifact at `~/.gstack/projects/meshblog/qkdwodus777-main-test-plan-20260419-0030.md`)
- [x] Phase 3.5 DX Review — completed 2026-04-19
- [x] Phase 4 Final Gate — approved 2026-04-19

**PLAN APPROVED.** Ready for execution starting with Task 0 (AF bundle + ED6/ED7 + T7 gitignore + workflow chain) → Task 0.5 (FIXTURE_ONLY) → Task 1.

---
