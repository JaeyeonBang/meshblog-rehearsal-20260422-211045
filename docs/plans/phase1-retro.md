# Phase 1 Retro — Harvest Pipeline 검증

**Date:** 2026-04-18
**Plan:** `2026-04-18-meshblog-phase1.md`
**Runtime note:** T9 (실제 OpenRouter 호출) 보류. 사용자가 API key 없이 진행 결정.
나머지 kill gate는 stubbed LLM 기반 smoke로 검증됨.

## Kill Gates

| Criterion | Threshold | Pass / Fail | Evidence |
|---|---|---|---|
| Volla `lib/rag/graph.ts` 이식 (extractEntities) | 3 tests PASS (smoke+schema+idempotency) | **PASS** | `vitest run`: 6 tests passed (schema 4 + smoke 2) |
| MD 5개 → SQLite 인덱스 생성 동작 | 모든 published note `graph_status='done'`, `_drafts/`는 row 없음 | **PASS** (stubbed) | smoke test: `notes.every(graph_status === 'done')` + `04-secret` absent |
| Astro build + SQLite 통합 검증 (Patch C2) | `astro build` exit 0, `dist/index.html`에 entity ≥ 1 | **PASS** | `dist/index.html`에 `react`, `typescript`, `nextjs`, `prisma`, `drizzle`, `글쓰기` 6 entity 렌더링 확인 |
| 비용 / 노트 | < $0.01 per note | **DEFERRED (no API key)** | T9 보류로 측정 불가 |
| LLM JSON 파싱 실패율 | < 20% (5 노트 중 retry ≤ 1) | **DEFERRED (no API key)** | `response_format: json_object` (Patch B2) 선적용으로 실패 확률 최소화 |
| Entity recall (taste check) | vault prose 픽스처에서 entity ≥ 3, 60%+ "맞음" | **DEFERRED (no API key)** | `philosophy-on-writing.md` 픽스처는 준비됨 |
| content_hash skip 동작 (Patch D2) | 2회차 build에서 5/5 skipped | **PASS** | idempotency test: `r2.skipped === r1.processed` assertion green |

### Summary
- **PASS: 4/7** — 이식·스키마·통합·skip 모두 검증됨
- **DEFERRED: 3/7** — 실 LLM 호출에 의존하는 taste/cost/failure-rate 항목

## Review Patches 반영 체크
- [x] Patch A — kill gates 테이블 구체화
- [x] Patch B1 — 모든 import 상대경로 (`../db/index.ts` 등). `@/*` 미사용
- [x] Patch B2 — `response_format: { type: "json_object" }` 요청 본문에 포함
- [x] Patch B3 — `dotenv.config({ path: ".env.local" })` + `.env.example` 커밋
- [x] Patch C1 — mocked smoke test로 파이프라인 조기 검증 (T9 의존 없이 green)
- [x] Patch C2 — `src/pages/index.astro`가 build 타임에 SQLite top-10 읽어 렌더
- [x] Patch D1 — 17 tests → 6 tests (schema 4 + smoke 2). 개별 unit test 삭제
- [x] Patch D2 — `build-index.ts` content_hash skip + `→ skipped (unchanged)` 로그
- [x] Patch E1 — `.env.example` 커밋
- [x] Patch E2 — 5 픽스처 (기존 3 + `philosophy-on-writing.md` prose + `_drafts/04-secret.md`). `01-react-hooks.md`에 `level_pin: 2`
- [x] Patch E3 — README.md에 `bun run setup` + `bun run build-index` 명령 명시

## 발견된 footgun

### 1. Bun 런타임 ↔ `better-sqlite3` 미지원 (critical)
- **증상:** `bun -e '...better-sqlite3...'` → `'better-sqlite3' is not yet supported in Bun`
- **원인:** Bun 1.3.11은 `better-sqlite3` native addon 미지원 ([oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290)). bun은 대안으로 `bun:sqlite` built-in 제공
- **대응:** `"build-index": "tsx scripts/build-index.ts"`로 교체. Vitest는 원래 Node에서 돌아 영향 없음. `tsx`를 `devDependencies`에 추가
- **trade-off:** Bun 단일 런타임 목표 포기. 스크립트는 Node+tsx로 실행. 장기적으로 `bun:sqlite` 또는 wrapper 추상화 고려

### 2. `import.meta.url` entry-point 감지
- `if (import.meta.url === \`file://${process.argv[1]}\`)` 방식은 tsx 하에서 안 먹을 수 있음 → `process.argv[1]?.endsWith("build-index.ts")` fallback 추가

### 3. D1 ↔ D2 idempotency 정의 충돌
- D1은 "2회차 mention_count 2배", D2는 "hash 같으면 extract 스킵" → 둘 동시 성립 불가
- 해석: D2가 후행 합의이므로 우선. 테스트를 "2nd run 0 extract, mention_count 불변"으로 변경

### 4. TypeScript `Database` 타입 재export 혼란
- `export type { Database }`는 better-sqlite3의 default export 네임스페이스. 소비측은 `Database.Database`로 인스턴스 타입 참조해야 함. graph.ts 작성 중 1회 수정

## Phase 2 이관 메모
- **concepts.ts 이관:** Phase 1은 `extractEntities`만 이식. `concepts.ts` + `graph-topology.ts`(Louvain) 의존성 아직 붙이지 않음. Phase 2 초입에서 Volla 원본 재분석 필요
- **build-index 런타임:** Phase 2 이후에도 tsx 유지 or bun:sqlite wrapper로 전환할지 결정 필요
- **T9 실행 시점:** 사용자가 API key를 프로비저닝하는 대로 `bun run build-index` 1회만 돌려 cost/retry/taste 3 gate 확정 가능. 현 구현에서 code 변경 불필요

## Go / No-Go
- **Technical blockers:** 없음. 파이프라인 end-to-end 동작 (stubbed LLM 기준)
- **Gating 보류:** 3 deferred gate는 단일 `build-index` 실행만 필요. Phase 2 설계와 독립
- **판단:** Phase 2 플랜 작성 진행 가능. DEFERRED gate는 Phase 2 킥오프 전 사용자 타이밍에 맞춰 closeout
