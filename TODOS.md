# TODOS — Deferred Items

## Resolved by v1 scope (eng-review 2026-04-21)

- ~~**Task 0.5** — FIXTURE_ONLY=1 mode~~ — shipped pre-v1 (scripts/build-index.ts:290)
- ~~**T2** — Related notes vs backlinks distinction~~ — resolved by D4 (SSR backlinks sidebar + `getBacklinksForNote` + `src/pages/notes/[slug].astro:77` TODO closed)

## Task 8 — Deferred UX items (still deferred past v1)

- **T3**: Graph node encoding — color/size encoding for node types and weight (v2 polish)
- **T4**: Site tagline — finalize and add to layout (v2 polish)
- **T5**: Long answer overflow — truncation + expand UI for long QA card answers (v2 polish)

## Post-Phase 3 — Multi-author safety

Add `rehype-sanitize` if meshblog is ever adapted for multi-author content. Currently `rehype-raw` is enabled and all `content/` is treated as trusted (single-author only).
