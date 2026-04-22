# meshblog PRD

Date: 2026-04-18
Status: APPROVED
Origin: Pivoted from `JaeyeonBang/volla` (archive/volla-saas-v3). Builds on `~/.gstack/projects/JaeyeonBang-volla/qkdwodus777-develop-design-20260416-meshblog-pivot.md`.

## 0. Tagline

Primary candidate (lead in README/HN/twitter):

> **A public second brain that answers questions — without a server.**

Supporting alternatives (kept for marketing iteration):

- *Pre-generated chatbot UX for your Obsidian vault. Static, free, forkable.*
- *Two graphs of your mind. Static. AI-baked. Hosted on github.io.*

## 1. Vision

Obsidian vault를 입력으로, **"챗봇 없는 챗봇 UX" + "공개되는 2nd brain 그래프"** 를 가진 정적 사이트를 자동 생성하는 OSS 템플릿. 런타임은 Claude Code slash commands. 서버 / DB / 인증 없음.

핵심 고리:
1. Obsidian에서 MD를 쓴다.
2. `/refresh` → 빌드타임에 SQLite 인덱스 + Q&A 사전 생성 + Note/Concept 그래프 산출.
3. `/publish` → github.io에 배포.
4. 방문자는 Fuse.js 검색으로 사전 답변을 즉시 받고, `/graph`에서 노트 그래프와 개념 그래프를 토글하며 본다.

## 2. Target User (v1)

- **Primary**: 본인 (qkdwodus777). Obsidian + GitHub + Claude Code 익숙.
- **Secondary**: Obsidian 쓰는 개발자/파워유저 — README 기반 onboarding로 fork 가능한 수준.
- **Explicit non-target (v1)**: 진짜 비개발자 (gh / cc 처음). 손잡고 안내하는 UX는 v2 이후 검토.

이 결정은 설계 문서 213줄에서 본인이 짚은 페르소나 모순(*"비개발자도"와 "Obsidian 쓰는 사람"은 같은 층이 아님*)을 v1에서 후자로 좁힌 것.

## 3. Success Criteria (v1 ship 정의)

다음 두 기준이 **둘 다** 충족되어야 v1 종료:

- **(A) 매일 쓰는 도구**: 한 달 동안 Obsidian → `/publish` 5회 이상, 본인이 자기 사이트를 visit해서 그래프/Q&A를 실제로 활용.
- **(B) 외부 데모 가능**: 친구/트위터/HN에 "이거 봐봐" 보낼 만한 디자인/그래프/Q&A 퀄리티.

함의: 디자인 cut line 이 높다. "기능 동작"만으로는 v1 ship 아님. Phase 5에 명시적 디자인 sprint 배치.

## 4. Scope

### v1 In — Full Spec (설계 문서 그대로)

**Skills (6)**:

| Skill | Purpose |
|---|---|
| `/init` | vault 위치 선택 (레포 안 / 외부 symlink), gh-pages 활성화, .env (OpenAI / Anthropic 키) |
| `/new-post` | Obsidian에 frontmatter 갖춘 새 MD 생성 |
| `/refresh` | MD 스캔 → SQLite 인덱싱 → embed → Q&A 사전 생성 → graph JSON export |
| `/ask` | 로컬 RAG 질의 (CC 내부, 검증/디버깅용) |
| `/publish` | build + gh-pages push |
| `/theme` | Tailwind 토큰 조정 |

**Build pipeline**:

- MD → SQLite 인덱스 (entities, concepts, embeddings, edges, **content_hash**)
- 3-tier Q&A 사전 생성 (글 단위 / concept 단위 / global) — claude-sonnet
- Note Graph + Concept Graph 두 종류 export, 각 Level 1~3 JSON

**Visitor UX**:

- 홈 (최신 포스트 + brain preview + global FAQ chips)
- 포스트 / 노트 페이지 (본문 + 글 단위 FAQ chips + 연결된 노드 링크)
- `/graph`: **모드 토글 (노트 그래프 ↔ 개념 그래프) × Level 1~3 nested**
- 검색 = Fuse.js fuzzy match → 사전 답변 표시. 실패 시 "가까운 글 3개" fallback.

### v1 Out — Non-goals (명시)

| # | Non-goal | Rationale |
|---|---|---|
| 1 | 댓글, 좋아요, view counter | 정적 사이트, 분석은 GA 외부에서 |
| 2 | 인브라우저 편집기 (Tiptap 등) | Obsidian이 편집기 |
| 3 | 멀티유저 / 인증 | Single-user 정적 |
| 4 | 실시간 챗봇 / API key 사용자 노출 | Pre-gen Q&A로 대체 |
| 5 | 커스텀 도메인 onboarding 자동화 | gh-pages 기본만 |
| 6 | 모바일 앱 | 반응형 웹만 |
| 7 | SEO 깊은 최적화 | 기본 OG / sitemap만 |
| 8 | 비개발자 onboarding UX 깊이 | v2 이후 검토 |
| 9 | Note + Concept 통합 그래프 뷰 (단일 화면 색상 구분) | v2 후보. v1은 모드 스위치만 |
| 10 | Incremental rebuild | v1 full rebuild. 100노트 임계점 넘으면 v2 trigger. **단 SQLite 스키마는 처음부터 incremental 가능하게 설계**. |

## 5. Differentiation

| 대안 | 강점 | meshblog 대비 약점 | meshblog의 unique |
|---|---|---|---|
| Obsidian Publish ($8/mo) | 공식, 백링크 | 유료, AI 0 | 무료 OSS, AI Q&A |
| Quartz (OSS) | 빠름, Obsidian 호환 | AI 0, concept graph 없음 | dual graph, pre-gen Q&A |
| Astro Starlight | 깔끔한 docs | KM 워크플로우 약함, 그래프 없음 | KM 중심, 그래프 |
| Andy Matuschak / Maggie Appleton notes | 디자인 아이콘 | 손제작, 템플릿 아님 | 누구나 fork |
| Logseq Publish, Foam, Dendron | 각자 워크플로우 | 그래프 / AI 부분적 | dual graph + 빌드타임 Q&A |

**핵심 차별화**: 빌드타임 pre-generated Q&A + Note/Concept dual 공개 그래프. 둘 다 동시에 갖춘 도구는 현재 없음.

## 6. Technical Decisions

설계 문서의 5 Open Questions 결정 결과:

| ID | 결정 | 근거 |
|---|---|---|
| Q1 vault 위치 | (A) 레포 안 + (B) 외부 symlink **둘 다 지원**. `/init`에서 사용자 선택 | 본인은 (B), 외부 fork 시 (A)가 단순 |
| Q2 frontmatter 공개 정책 | **폴더 기반** (`posts/`, `notes/` = 빌드, `_drafts/` = 무시) + frontmatter `public: false` override | 워크플로우 friction 최소 |
| Q3 빌드 비용 | v1은 **full rebuild**, 100노트 임계점 넘으면 v2 incremental. 단 **content_hash 컬럼은 처음부터 SQLite 스키마에 포함** | v1 단순, 미래 확장성 보존 |
| Q4 임베딩 모델 | **OpenAI text-embedding-3-small** | Volla 검증, 0 작업 이식 |
| Q5 Graph Level 분류 | (D) **PageRank 자동 + frontmatter `level_pin: 1\|2\|3` override** | 자동(low friction) + 직관 안 맞을 때 수동 보정 |

추가 결정:

- **Graph Mode**: 모드 스위치 UX. Note Graph와 Concept Graph는 별개의 산출물(JSON)로 빌드. v1은 토글, v2에서 통합 뷰 검토.
- **Tech stack**: Astro 5 + @astrojs/react, better-sqlite3, OpenAI embeddings, claude-sonnet (Q&A 생성), Fuse.js (방문자 검색), d3-force (그래프 시각화).

## 7. Phasing

풀 스펙은 한 번에 ship 어려움. 각 phase 끝마다 demo 가능한 상태 유지.

### Phase 1 — Harvest pipeline 검증 (설계 문서 The Assignment)

- Volla `lib/rag/graph.ts` + `lib/rag/concepts.ts` **단 2개 파일** 이식
- MD 3개 → SQLite 인덱스 동작 확인
- 목적: Astro + SQLite + RAG 조합의 근본 가정 검증. 이게 안 되면 PRD 자체 재검토.

### Phase 2 — 빌드 파이프라인 완성

- Volla `lib/rag/*` 12개 파일, `lib/card/*` 4개 파일, `lib/llm/prompts/*` 전체 이식
- `scripts/build-index.ts` (MD → SQLite)
- `scripts/generate-qa.ts` (claude-sonnet으로 글/concept/global Q&A 생성)
- `scripts/export-graph.ts` (SQLite → Note Graph JSON × Level 1~3, Concept Graph JSON × Level 1~3)
- 본인 vault 일부로 dry-run, 비용 측정 (목표: <$1 / 20 노트)

### Phase 3 — 방문자 UX

- Astro pages: `index.astro`, `posts/[slug].astro`, `notes/[slug].astro`, `graph.astro`
- React islands: `MarkdownView` (react-markdown + rehype harvest), `QAChips` (Fuse.js), `GraphView` (d3-force, 모드 스위치 + Level 토글), `BrainPreview`
- 검색 fallback "가까운 글 3개"

### Phase 4 — CC skills + 배포

- 6개 skill (`init`, `new-post`, `refresh`, `ask`, `publish`, `theme`) 구현
- `.github/workflows/deploy.yml` (push → build → gh-pages)
- 본인 vault 전체로 end-to-end 배포 검증

### Phase 5 — Design sprint (성공 기준 B 충족)

- Tailwind 토큰 정리
- 그래프 / Q&A chip / 홈페이지 디자인 다듬기
- 외부 reviewer 1~2명에게 데모, 피드백 1 round 반영

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 풀 스펙 → ship 지연 | High | 5 phase 분할, 각 phase 끝마다 demo 가능 상태 유지 |
| 디자인 cut line 높음 (성공 기준 B) | Med | Phase 5 명시적 sprint. 외부 reviewer 빨리 끌어옴 |
| Note + Concept dual graph 중복 작업 | Low | 같은 SQLite 데이터에서 두 view 추출. `export-graph.ts`에서 분기 |
| OpenAI / Anthropic 비용 폭주 | Med | content_hash 비교로 변경 안 된 글은 Q&A 재생성 skip. 빌드 시 추정 비용 출력 |
| Volla harvest 호환성 (Next.js 전제 코드) | Med | 이식 시 의존성 grep, Astro / 순수 Node 환경에 맞게 수정 |
| 본인 vault 노트 수가 100 넘어서 v1 빌드 시간 폭주 | Low | 100 임계점 도달 시 incremental 도입 (스키마 이미 준비됨) |

## 9. Next Steps

1. ✅ PRD 승인 → 본 문서 저장
2. **`writing-plans` skill로 Phase 1 implementation plan 작성**
3. Phase 1 실행 (harvest 검증) — `lib/rag/graph.ts` + `concepts.ts` 이식 + MD 3개 파이프라인
4. Phase 1 통과 시 Phase 2 plan 작성, 실패 시 PRD/설계 재검토

## Appendix — Open Questions (해소됨)

설계 문서 168~174줄의 5개 Open Questions 처리 결과는 §6 Technical Decisions에 통합됨. 추가로 발생할 수 있는 새 questions는 phase 별 plan 단계에서 다룬다.
