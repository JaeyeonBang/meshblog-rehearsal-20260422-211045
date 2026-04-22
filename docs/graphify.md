# graphify 사용법

AI 코딩 어시스턴트용 지식 그래프 스킬. 코드·문서·이미지에서 개념과 관계를 추출해 그래프로 묶어, `/graphify`로 Claude Code에서 바로 쿼리한다.

- Repo: https://github.com/safishamsi/graphify
- PyPI 패키지명: `graphifyy` (CLI는 `graphify`)

---

## 1. 설치 상태 (이 머신)

이미 설치 완료. 재설치 필요 없음.

```bash
# Python 3.12 기반 uv tool로 설치됨
uv tool install graphifyy --python 3.12

# CLI 위치
which graphify        # ~/.local/bin/graphify (uv tool shim)

# Claude Code 전역 스킬도 등록됨
# - ~/.claude/skills/graphify/SKILL.md
# - ~/.claude/CLAUDE.md 에 /graphify 트리거 등록
```

> 주의: 이 WSL 환경의 시스템 Python은 3.8이라 `pip install graphifyy`가 실패한다. 반드시 `uv tool` 또는 `pipx`로 Python 3.10+ 환경에서 설치해야 한다.

업그레이드/제거:

```bash
uv tool upgrade graphifyy
uv tool uninstall graphifyy
```

---

## 2. 가장 빠른 시작

Claude Code 세션에서:

```
/graphify .
```

현재 디렉토리를 스캔해서 `graphify-out/`에 그래프를 생성한다.

```
graphify-out/
├── graph.html        # 인터랙티브 시각화 (브라우저에서 열기)
├── GRAPH_REPORT.md   # 갓 노드 / 커뮤니티 / 추천 질문 요약
├── graph.json        # 머신 가독 그래프 (쿼리 대상)
└── cache/            # SHA256 캐시 (재실행 시 변경 파일만 재처리)
```

> `graphify-out/`은 `.gitignore`에 추가해 두는 게 좋다 (캐시/HTML 용량 큼).

---

## 3. meshblog에서의 권장 사용 시나리오

이 레포는 Astro 빌드 + `content/notes/` 마크다운 + `design-ref/` 문서 + `src/components/` 아톰믹 설계로 구성돼 있어, graphify가 특히 잘 맞는다.

### 3.1 전체 레포 스캔

```bash
# Claude Code 에서
/graphify .

# 또는 쉘에서 직접
graphify update .
```

권장: `.graphifyignore`를 레포 루트에 추가해 빌드 산출물 제외.

```
# .graphifyignore (.gitignore 와 동일 문법)
node_modules/
dist/
.astro/
.data/
graphify-out/
bun.lock
```

### 3.2 노트/문서만 스캔 (디자인 맥락 파악)

```bash
/graphify ./content
/graphify ./design-ref
```

디자인 결정의 "이유"가 `design-ref/SPEC.md`, `design.md`, `CLAUDE.md` 주석에서 `rationale_for` 노드로 뽑혀 나온다.

### 3.3 변경분만 증분 업데이트

```bash
graphify update .         # 변경된 파일만 재추출 + 그래프 병합
graphify cluster-only .   # 그래프 재사용, 클러스터링만 재실행
```

### 3.4 외부 자료 링크 추가

```bash
# 논문/트윗/블로그를 ./raw 에 저장 후 그래프에 병합
graphify add https://arxiv.org/abs/1706.03762 --author "Vaswani et al."
graphify add https://x.com/.../status/... --contributor "본인"
```

---

## 4. 그래프 쿼리하기

그래프가 생성되면 터미널이나 Claude Code 어디서든 질의 가능.

```bash
# 자연어 질의 (BFS)
graphify query "tokens.css는 어디서 생성되고 누가 소비하는가?"

# DFS (특정 경로 추적)
graphify query "withBase가 어떻게 GitHub Pages base 경로와 엮여있는가?" --dfs

# 토큰 예산 제한
graphify query "QAChips 컴포넌트의 데이터 흐름" --budget 1500

# 두 노드 사이 최단 경로
graphify path "design.md" "src/styles/tokens.css"

# 한 노드 자연어 설명
graphify explain "GraphView"
```

Claude Code 세션에서는 동일하게:

```
/graphify query "..."
/graphify path "A" "B"
/graphify explain "X"
```

---

## 5. "항상 그래프 먼저 참조" 모드 (권장)

이 레포에서 Claude Code가 Glob/Grep 전에 `GRAPH_REPORT.md`를 자동으로 읽게 하려면 **한 번만** 실행:

```bash
# meshblog 루트에서
graphify claude install
```

이게 하는 일:

1. 프로젝트 `CLAUDE.md`에 "아키텍처 질문 전에 `graphify-out/GRAPH_REPORT.md`를 먼저 읽어라" 섹션 추가
2. `.claude/settings.json`에 **PreToolUse 훅** 설치 — Glob/Grep 호출 직전에 Claude가 그래프 존재를 알림받음

해제:

```bash
graphify claude uninstall
```

> meshblog `CLAUDE.md`는 이미 수기 작성된 핵심 문서라, install 전에 diff를 꼭 확인하고 필요 섹션만 병합하는 걸 추천.

---

## 6. 자동 갱신 (선택)

### 6.1 파일 감시 (백그라운드)

```bash
graphify watch .
# 코드 변경 → 즉시 AST 재빌드 (LLM 호출 없음)
# 문서/이미지 변경 → "graphify update . 실행하세요" 알림
```

### 6.2 Git 훅

```bash
graphify hook install     # post-commit, post-checkout 설치
graphify hook status
graphify hook uninstall
```

매 커밋·브랜치 전환 후 그래프가 자동 재빌드된다. 실패 시 훅이 non-zero로 종료해 조용한 실패를 막는다.

---

## 7. 다른 산출물 내보내기

```bash
graphify update . --svg            # graph.svg
graphify update . --graphml        # Gephi / yEd 용
graphify update . --neo4j          # cypher.txt 생성
graphify update . --wiki           # 커뮤니티별 위키 + index.md
graphify update . --obsidian       # Obsidian 볼트
```

MCP 서버로 띄워서 Claude Code 도구로 직접 쿼리시키기:

```bash
python -m graphify.serve graphify-out/graph.json
# query_graph, get_node, get_neighbors, shortest_path 도구 노출
```

---

## 8. 지원 파일 유형 (요약)

| 유형 | 확장자 | 추출 방식 |
|------|--------|-----------|
| 코드 | `.py .ts .tsx .js .jsx .astro* .go .rs .java .rb .cs .kt .scala .php .swift .lua .zig .ps1 .ex .m .jl ...` | tree-sitter AST, 로컬 처리 (LLM 미호출) |
| 문서 | `.md .txt .rst` | Claude로 개념+관계+근거 추출 |
| 오피스 | `.docx .xlsx` | `pip install graphifyy[office]` 필요 |
| 논문 | `.pdf` | 인용 + 개념 |
| 이미지 | `.png .jpg .webp .gif` | Claude Vision |

> `.astro`는 tree-sitter 지원 언어 목록에 없어, 프런트매터/스크립트 부분만 부분적으로 잡힌다. 디자인 맥락은 `.md` (SPEC.md, CLAUDE.md, design.md) 쪽이 훨씬 잘 추출됨.

---

## 9. 주의사항

- **개인정보**: 문서/이미지는 플랫폼 모델 API(Anthropic 등)로 전송됨. 코드 파일은 tree-sitter로 로컬 처리만 된다.
- **토큰 비용**: 첫 전체 빌드 한 번만 LLM 호출이 많다. 이후 `update`/`cluster-only`/쿼리는 캐시 덕에 저렴.
- **그래프는 근거를 태깅한다**: 모든 엣지는 `EXTRACTED`(소스에서 직접) / `INFERRED`(추론 + `confidence_score`) / `AMBIGUOUS`(리뷰 필요) 중 하나. 발견 vs 추측이 구분된다.
- **`graph.json`을 프롬프트에 통째 붙여넣지 말 것.** `GRAPH_REPORT.md`로 개요 잡고 → `graphify query`로 서브그래프만 뽑아서 LLM에 넣는 패턴이 정석.

---

## 10. 이 레포용 빠른 체크리스트

첫 실행:

```bash
# 1. ignore 파일 추가 (위 3.1 참고)
# 2. .gitignore 에 graphify-out/ 추가
echo "graphify-out/" >> .gitignore

# 3. 첫 전체 빌드
graphify update .

# 4. 리포트 확인
$BROWSER graphify-out/graph.html
cat graphify-out/GRAPH_REPORT.md

# 5. 필요 시 Claude Code 상시 작동 모드
graphify claude install
```

일상 운용:

```bash
graphify update .                       # 변경분만 재추출
graphify query "..."                    # 터미널 질의
/graphify query "..."                   # Claude Code 안에서 질의
```
