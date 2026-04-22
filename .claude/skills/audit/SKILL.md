---
name: audit
description: Catch draft leaks and orphan DB rows before they ship. Runs `audit-drafts.ts` against the last ingested DB — fails if any note with `draft: true` or `public: false` frontmatter still has a row, or if a DB row has no source file on disk. Invoke after `build-index` and always on `main` before push.
---

# audit

Safety net for the meshblog ingest pipeline. Two classes of regression:

1. **Draft leak** — a note with `draft: true` / `public: false` frontmatter, but the last `build-index` run left its row in the DB. Usually means frontmatter was flipped *after* a published run and no rebuild happened, or ingest lost the exclusion branch.
2. **Orphan DB row** — note was deleted from disk but its DB row stayed. Usually means somebody `rm`ed the `.md` without a fresh `build-index` to prune.

Both leak content to the live site. Both are cheap to check.

## Run

```bash
bunx tsx scripts/audit-drafts.ts
```

Exit code `0` = clean. Exit code `1` = leaks found (stderr lists offenders).

## Fix

- **Draft leak** → re-run `bun run build-index` (or `build:fixture` locally). The ingest now deletes stale rows for `draft:true` / `public:false`.
- **Orphan** → same. `build-index` should prune, but you can also `DELETE FROM notes WHERE id = '<id>'` directly if you know the row is stale.

## When to run

- Before every `git push` that touches `content/`
- Inside CI before deploy (exit-on-leak)
- When diagnosing a weird live-site row that should not be there
