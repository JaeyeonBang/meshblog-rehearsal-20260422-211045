# PostgreSQL → SQLite Porting Rules

> **CRITICAL — READ THIS FIRST.**
> All parallel port agents (Tasks 3–8) must read this document in full **before** writing any code.
> No pg→SQLite conversion without this cheat-sheet. No regex auto-rewrite — every file requires manual review.

This document encodes the mechanical translation rules discovered during Phase 2 pre-review (Eng F1, F3, Amendment B). Violations that slip through will cause runtime failures, silent data corruption, or schema type mismatches.

---

## Quick grep to find conversion targets

```bash
grep -nE '\$[0-9]+|::uuid|::text\[\]|NOW\(\)|ANY\(\$|RETURNING id|ON CONFLICT' /mnt/d/projects/volla/web/src/lib/rag/*.ts /mnt/d/projects/volla/web/src/lib/card/*.ts | head -40
```

---

## Rule Table

| # | Pattern (PostgreSQL) | Replacement (SQLite / JS) | Notes |
|---|---|---|---|
| 1 | `$1`, `$2`, `$3` … | `?`, `?`, `?` | better-sqlite3 uses positional `?`. Named bind (`@name`) also OK. Order of params array must match. |
| 2 | `uuid` column type | `TEXT` + `crypto.randomUUID()` in JS | Insert the UUID from JS before the query. SQLite has no native UUID type. |
| 3 | `NOW()` / `CURRENT_TIMESTAMP` | `datetime('now')` | Always UTC. For comparisons, normalize with `datetime(col)`. |
| 4 | `text[]` array columns | `TEXT` (JSON string) | Store as `JSON.stringify(arr)` on write. Read with `JSON.parse(row.col)`. Apply at data-access boundary, not inside SQL. |
| 5 | `vector(1536)` / pgvector `<->` / `<=>` | `BLOB` (Float32Array bytes) | Cosine similarity is computed in JS via `lib/llm/cosine.ts`. **Never** attempt vector math in SQL. Mark any ported line that contains `<=>` or `<->` with `// TODO: replaced by JS cosine`. |
| 6 | `UNNEST($1::uuid[]) AS id` | Loop-in-transaction OR `VALUES (?),(?),...` CTE | SQLite has no `UNNEST`. Expand the array on the JS side; emit one `?` per element. |
| 7 | `col != ALL($1::uuid[])` / `ANY($1::text[])` | `col NOT IN (?,?,...)` / `col IN (?,?,...)` | Dynamic placeholder list. Build `Array(n).fill('?').join(',')` in JS and spread the array as params. |
| 8 | **FK type check** | **Always verify FK type matches referenced PK type** | `entities.id INTEGER PRIMARY KEY AUTOINCREMENT` → any `entity_id` FK **must** be `INTEGER NOT NULL`, not `TEXT`. Check `schema.sql` before writing every new table. Current Phase 2 affected tables: `concept_entities.entity_id` → `INTEGER`. `graph_levels.node_id` → `TEXT` (polymorphic — see note below). |
| 9 | Dynamic CTEs (`WITH x AS (...)` with runtime interpolation) | Multiple sequential queries + JS join | SQLite supports CTEs, but pg-style runtime-interpolated CTE strings are fragile. Split into two queries; join in JS. |
| 10 | `ON CONFLICT (col) DO UPDATE SET col = EXCLUDED.col` | `ON CONFLICT (col) DO UPDATE SET col = excluded.col` | SQLite uses **lowercase** `excluded`; pg uses uppercase `EXCLUDED`. Otherwise syntax is identical. |

---

## user_id removal rule

All ported files **must** drop the multi-tenant `user_id` parameter entirely:

- Remove `userId` from every function signature.
- Delete `WHERE user_id = ?` (or `WHERE user_id = $1`) from every query.
- Single-user assumption: uniqueness is enforced by natural keys only.
  - `entities`: `UNIQUE(name, entity_type)` — already in Phase 1 schema.
  - `concepts`: `UNIQUE(name)` — added in Phase 2 schema.
  - `notes`: `id TEXT PRIMARY KEY` (slug-based) — no user scope.

---

## graph_levels.node_id polymorphism

`graph_levels.node_id TEXT NOT NULL` is intentionally polymorphic:
- When `graph_type = 'note'`, `node_id` holds `notes.id` (TEXT slug).
- When `graph_type = 'concept'`, `node_id` holds `concepts.id` (TEXT UUID).

There is no FK constraint on `graph_levels.node_id` because SQLite cannot express polymorphic foreign keys. This is a deliberate trade-off documented here. The application layer enforces referential integrity.

---

## RETURNING clause

`RETURNING id` works in SQLite with `better-sqlite3 >= 3.38`. Use `.get()` to retrieve the returned row:

```ts
const row = db.prepare('INSERT INTO ... RETURNING id').get(params) as { id: string }
```

Do **not** use `.run()` for queries with `RETURNING` — it discards the result.

---

## Parallel port checklist (one copy per agent)

Before submitting any ported file, verify each line against this checklist:

- [ ] No `$n` placeholders remain (all replaced with `?`)
- [ ] No `::uuid`, `::text[]`, `::vector` casts remain
- [ ] No `NOW()` or `CURRENT_TIMESTAMP` remain (all `datetime('now')`)
- [ ] No `UNNEST(...)` in SQL (expanded to JS loop or VALUES CTE)
- [ ] No `ANY(...)` or `ALL(...)` array predicates in SQL (expanded to `IN (?,?,...)`)
- [ ] No `embedding <=>` or `<->` in SQL (replaced by JS cosine comment)
- [ ] No `EXCLUDED.x` (uppercase) in `ON CONFLICT` clauses (lowercased to `excluded.x`)
- [ ] `user_id` parameter removed from function signature and query
- [ ] Every FK `entity_id` verified as `INTEGER` (not `TEXT`)
- [ ] No dynamic CTE string interpolation (split into sequential queries)
