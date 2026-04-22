---
name: refresh
description: Rebuild the whole site locally after editing notes, tokens, or before pushing
---

# /refresh

Rebuild the whole site locally — use after editing notes, changing tokens, or before pushing.

## What it does
1. `build-tokens` — design.md → src/styles/tokens.css
2. `build-index` — markdown → SQLite (notes, entities, concepts, embeddings if OPENAI_API_KEY set)
3. `build-backlinks` — wikilinks → backlinks.json (skipped silently if not yet wired)
4. `preview` — serve dist/ at localhost

Requires: OPENAI_API_KEY for full pipeline, or FIXTURE_ONLY=1 for keyless mode.

## Run
`bun run refresh`
