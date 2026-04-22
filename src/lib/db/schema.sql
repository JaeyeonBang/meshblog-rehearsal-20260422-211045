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
  level_pin     INTEGER,                  -- frontmatter override: 1 | 2 | 3 | NULL
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

-- ── Phase 2 tables ──────────────────────────────────────────────────────────

-- Concepts: Louvain community clustering results
CREATE TABLE IF NOT EXISTS concepts (
  id          TEXT PRIMARY KEY,          -- crypto.randomUUID()
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  confidence  REAL NOT NULL DEFAULT 0.5,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Concept ↔ entity membership
-- PORTING NOTE (rule 8): entities.id is INTEGER PRIMARY KEY AUTOINCREMENT
--   therefore entity_id MUST be INTEGER here (not TEXT).
CREATE TABLE IF NOT EXISTS concept_entities (
  concept_id  TEXT    NOT NULL,
  entity_id   INTEGER NOT NULL,          -- FIXED: INTEGER matches entities.id
  PRIMARY KEY (concept_id, entity_id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)  ON DELETE CASCADE,
  FOREIGN KEY (entity_id)  REFERENCES entities(id)  ON DELETE CASCADE
);

-- Embeddings: chunk-level vectors stored as BLOB (Float32Array, 1536 × 4 = 6144 bytes)
CREATE TABLE IF NOT EXISTS note_embeddings (
  id          TEXT    PRIMARY KEY,       -- crypto.randomUUID()
  note_id     TEXT    NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT    NOT NULL,
  embedding   BLOB    NOT NULL,          -- Float32Array bytes (text-embedding-3-small = 1536 dim)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(note_id, chunk_index),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- Q&A cards: 3-tier (per-note / per-concept / global)
CREATE TABLE IF NOT EXISTS qa_cards (
  id           TEXT PRIMARY KEY,           -- crypto.randomUUID()
  tier         TEXT NOT NULL CHECK (tier IN ('note', 'concept', 'global')),
  note_id      TEXT,                       -- non-null when tier = 'note'
  concept_id   TEXT,                       -- non-null when tier = 'concept'
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  content_hash TEXT,                       -- sha256(content+PROMPT_VERSION+MODEL_VERSION) for cache
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (note_id)    REFERENCES notes(id)    ON DELETE CASCADE,
  FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qa_cards_tier    ON qa_cards(tier);
CREATE INDEX IF NOT EXISTS idx_qa_cards_note    ON qa_cards(note_id)    WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qa_cards_concept ON qa_cards(concept_id) WHERE concept_id IS NOT NULL;

-- Graph level assignments: PageRank results cache for export-graph re-runs
-- PORTING NOTE (rule 8 / polymorphism):
--   node_id is intentionally TEXT (not a typed FK) because it is polymorphic:
--   - when graph_type = 'note'    → node_id holds notes.id (TEXT slug)
--   - when graph_type = 'concept' → node_id holds concepts.id (TEXT UUID)
--   No FK constraint can be expressed for polymorphic references in SQLite.
--   Application layer enforces referential integrity.
CREATE TABLE IF NOT EXISTS graph_levels (
  graph_type TEXT    NOT NULL CHECK (graph_type IN ('note', 'concept')),
  node_id    TEXT    NOT NULL,           -- polymorphic: see note above
  level      INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
  pagerank   REAL    NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0, -- 1 = frontmatter level_pin override
  PRIMARY KEY (graph_type, node_id)
);

-- D4 backlinks: every [[wikilink]] occurrence, resolved or not
CREATE TABLE IF NOT EXISTS wikilinks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  TEXT NOT NULL,
  target_raw TEXT NOT NULL,      -- lowercased [[target]] text for lookup
  target_id  TEXT,               -- NULL when unresolved (broken link)
  alias      TEXT,               -- alias after the pipe, if any
  position   INTEGER NOT NULL,   -- character offset in source content (for dedup + ordering)
  FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wikilinks_target ON wikilinks(target_id);
CREATE INDEX IF NOT EXISTS idx_wikilinks_source ON wikilinks(source_id);
