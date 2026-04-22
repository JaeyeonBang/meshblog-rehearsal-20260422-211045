# E2E Tests

Playwright harness for meshblog. Runs against a pre-built `dist/` served by `bun run preview`.

## Setup

```bash
# Install browsers (first time only)
bunx playwright install chromium

# Run the full E2E suite (builds + seeds + tests)
bun run test:e2e
```

The `pretest:e2e` script runs automatically before `test:e2e`:
1. `FIXTURE_ONLY=1 bun run build-index` — seeds the DB from `test/fixtures/seed.sql`
2. `bun run export-graph` — builds graph JSON
3. `bun run build` — Astro production build into `dist/`
4. `tsx tests/e2e/_seed.ts` — seeds the `wikilinks` table with deterministic fixture data

## Test files

| File | Status | Description |
|------|--------|-------------|
| `backlinks-sidebar.spec.ts` | Active | BL-01 through BL-06: sidebar shows inbound links, aliases, hides on orphan/self |
| `backlinks-graph.spec.ts` | TODO | Graph mode backlinks toggle — depends on D4a build-backlinks.ts |

## Fixture topology

Wikilinks seeded by `_seed.ts` using IDs from `test/fixtures/seed.sql`:

```
fixture-rag-overview       ← HUB (receives 4 inbound links)
  ← fixture-ts-generics       (child-a, no alias)
  ← fixture-sqlite-patterns   (child-b, no alias)
  ← fixture-graph-algorithms  (child-c, no alias)
  ← fixture-글쓰기-철학        (aliased, alias = "alternative alias")

fixture-ts-generics        → fixture-ts-generics (self-ref, must not appear in sidebar)
fixture-graph-algorithms   (orphan: sends a link but receives none)
```

## Follow-up: backlinks-graph.spec.ts

`backlinks-graph.spec.ts` covers the `/graph` page Backlinks mode toggle introduced in D4.
It depends on `scripts/build-backlinks.ts` (D4a) being present and populating
`public/backlinks.json`. Ship this spec after D4a merges.
