-- test/fixtures/seed.sql
-- Idempotent fixture seed for FIXTURE_ONLY mode.
-- Vectors: 1536 zeros stored as a 6144-byte BLOB (Float32Array of 0.0).
-- To regenerate the zero-vector blob: new Float32Array(1536).buffer → 6144 zero bytes.
-- Entity IDs are explicit integers (schema: INTEGER PRIMARY KEY AUTOINCREMENT).
-- Concept IDs are stable UUIDs (TEXT PRIMARY KEY).
-- All UUIDs are fixed so the file is deterministic across runs.

-- ── Wipe existing fixture data (order respects FK constraints) ────────────────
DELETE FROM graph_levels;
DELETE FROM qa_cards;
DELETE FROM note_embeddings;
DELETE FROM concept_entities;
DELETE FROM concepts;
DELETE FROM entity_relationships;
DELETE FROM note_entities;
DELETE FROM entities;
DELETE FROM notes;

-- ── Notes (5, mix of en + ko) ─────────────────────────────────────────────────
INSERT INTO notes (id, slug, title, content, content_hash, folder_path, tags, graph_status, level_pin)
VALUES
  ('fixture-ts-generics',
   'fixture-ts-generics',
   'TypeScript Generics: A Practical Guide',
   'TypeScript generics allow you to write reusable, type-safe code. Use `extends` to constrain types. Utility types like Partial<T>, Required<T>, and Pick<T,K> are built on generics.',
   'abc0000000000000000000000000000000000000000000000000000000001',
   'content/notes',
   '["typescript","generics","type-system"]',
   'done',
   NULL),

  ('fixture-sqlite-patterns',
   'fixture-sqlite-patterns',
   'Better-SQLite3 Patterns',
   'better-sqlite3 is a synchronous SQLite driver for Node. Key patterns: WAL mode for concurrent reads, prepared statements for performance, transactions for batch writes, and PRAGMA foreign_keys=ON.',
   'abc0000000000000000000000000000000000000000000000000000000002',
   'content/notes',
   '["sqlite","database","node"]',
   'done',
   1),

  ('fixture-rag-overview',
   'fixture-rag-overview',
   'RAG: Retrieval-Augmented Generation',
   'RAG combines a vector store with an LLM. At query time, embed the question, retrieve top-k chunks, then pass them as context to the model. OpenAI text-embedding-3-small produces 1536-dim vectors.',
   'abc0000000000000000000000000000000000000000000000000000000003',
   'content/notes',
   '["rag","llm","embeddings","openai"]',
   'done',
   NULL),

  ('fixture-글쓰기-철학',
   'fixture-글쓰기-철학',
   '개발자의 글쓰기 철학',
   '글쓰기는 사고를 정제하는 도구다. 개발자가 문서를 쓸 때는 독자의 맥락을 먼저 이해해야 한다. 짧고 명확한 문장이 긴 설명보다 효과적이다. TIL(Today I Learned) 형식은 지식을 누적하는 좋은 습관이다.',
   'abc0000000000000000000000000000000000000000000000000000000004',
   'content/notes',
   '["글쓰기","문서화","지식관리"]',
   'done',
   NULL),

  ('fixture-graph-algorithms',
   'fixture-graph-algorithms',
   'Graph Algorithms with Graphology',
   'Graphology is a JavaScript graph library. PageRank scores nodes by connectivity. Louvain clustering groups nodes into communities. Use graphology-metrics for centrality calculations.',
   'abc0000000000000000000000000000000000000000000000000000000005',
   'content/notes',
   '["graph","algorithms","graphology","pagerank"]',
   'done',
   2);

-- ── Entities (15) ─────────────────────────────────────────────────────────────
-- IDs are explicit integers matching the AUTOINCREMENT column.
INSERT INTO entities (id, name, entity_type, description, mention_count)
VALUES
  (1,  'TypeScript',         'technology',  'Typed superset of JavaScript',            3),
  (2,  'generics',           'concept',     'Parametric polymorphism in type systems',  2),
  (3,  'better-sqlite3',     'technology',  'Synchronous SQLite driver for Node',       2),
  (4,  'WAL mode',           'concept',     'Write-Ahead Logging for SQLite',           2),
  (5,  'OpenAI',             'technology',  'AI platform providing embedding APIs',     2),
  (6,  'text-embedding-3-small', 'technology', '1536-dim embedding model by OpenAI',   2),
  (7,  'RAG',                'concept',     'Retrieval-Augmented Generation pattern',   2),
  (8,  'vector store',       'concept',     'Database optimised for embedding search',  1),
  (9,  'LLM',                'technology',  'Large Language Model',                     2),
  (10, 'graphology',         'technology',  'JavaScript graph library',                 2),
  (11, 'PageRank',           'algorithm',   'Link-analysis algorithm for graph nodes',  2),
  (12, 'Louvain',            'algorithm',   'Community detection algorithm',            1),
  (13, '글쓰기',              'concept',     '글을 쓰는 행위 및 기술',                   1),
  (14, 'TIL',                'concept',     'Today I Learned — incremental learning',   1),
  (15, 'SQLite',             'technology',  'Embedded relational database engine',      2);

-- ── note_entities (cross-reference) ──────────────────────────────────────────
INSERT INTO note_entities (note_id, entity_id) VALUES
  ('fixture-ts-generics',     1),   -- TypeScript
  ('fixture-ts-generics',     2),   -- generics
  ('fixture-sqlite-patterns', 3),   -- better-sqlite3
  ('fixture-sqlite-patterns', 4),   -- WAL mode
  ('fixture-sqlite-patterns', 15),  -- SQLite
  ('fixture-rag-overview',    5),   -- OpenAI
  ('fixture-rag-overview',    6),   -- text-embedding-3-small
  ('fixture-rag-overview',    7),   -- RAG
  ('fixture-rag-overview',    8),   -- vector store
  ('fixture-rag-overview',    9),   -- LLM
  ('fixture-글쓰기-철학',     13),  -- 글쓰기
  ('fixture-글쓰기-철학',     14),  -- TIL
  ('fixture-graph-algorithms',10),  -- graphology
  ('fixture-graph-algorithms',11),  -- PageRank
  ('fixture-graph-algorithms',12);  -- Louvain

-- ── entity_relationships (20) ─────────────────────────────────────────────────
INSERT INTO entity_relationships (source_entity_id, target_entity_id, relationship, confidence, source_type)
VALUES
  (1,  2,  'USES',            0.9, 'INFERRED'),
  (3,  15, 'WRAPS',           0.9, 'INFERRED'),
  (3,  4,  'SUPPORTS',        0.8, 'INFERRED'),
  (4,  15, 'FEATURE_OF',      0.8, 'INFERRED'),
  (5,  6,  'PROVIDES',        0.95,'INFERRED'),
  (5,  9,  'IS_A',            0.7, 'INFERRED'),
  (7,  8,  'REQUIRES',        0.9, 'INFERRED'),
  (7,  9,  'AUGMENTS',        0.9, 'INFERRED'),
  (8,  6,  'STORES',          0.8, 'INFERRED'),
  (9,  5,  'OFFERED_BY',      0.7, 'INFERRED'),
  (10, 11, 'IMPLEMENTS',      0.85,'INFERRED'),
  (10, 12, 'IMPLEMENTS',      0.85,'INFERRED'),
  (11, 12, 'RELATED_TO',      0.6, 'INFERRED'),
  (13, 14, 'PRACTICED_VIA',   0.7, 'INFERRED'),
  (1,  9,  'USED_WITH',       0.6, 'INFERRED'),
  (7,  6,  'USES',            0.9, 'INFERRED'),
  (15, 3,  'ACCESSED_VIA',    0.9, 'INFERRED'),
  (2,  1,  'FEATURE_OF',      0.8, 'INFERRED'),
  (12, 10, 'AVAILABLE_IN',    0.8, 'INFERRED'),
  (6,  7,  'ENABLES',         0.9, 'INFERRED');

-- ── note_embeddings (10, stubbed zero vectors) ────────────────────────────────
-- embedding is a 6144-byte blob of zeros = Float32Array(1536) all-zero.
-- zeroblob(6144) is a SQLite built-in that creates a zero-filled BLOB.
INSERT INTO note_embeddings (id, note_id, chunk_index, chunk_text, embedding)
VALUES
  ('e0000001-0000-0000-0000-000000000001', 'fixture-ts-generics',     0, 'TypeScript generics allow you to write reusable, type-safe code.',                          zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000002', 'fixture-ts-generics',     1, 'Utility types like Partial<T>, Required<T>, and Pick<T,K> are built on generics.',           zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000003', 'fixture-sqlite-patterns', 0, 'better-sqlite3 is a synchronous SQLite driver for Node.',                                    zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000004', 'fixture-sqlite-patterns', 1, 'Key patterns: WAL mode, prepared statements, transactions, and PRAGMA foreign_keys=ON.',     zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000005', 'fixture-rag-overview',    0, 'RAG combines a vector store with an LLM.',                                                   zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000006', 'fixture-rag-overview',    1, 'At query time, embed the question, retrieve top-k chunks, then pass them as context.',       zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000007', 'fixture-rag-overview',    2, 'OpenAI text-embedding-3-small produces 1536-dim vectors.',                                   zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000008', 'fixture-글쓰기-철학',     0, '글쓰기는 사고를 정제하는 도구다. 개발자가 문서를 쓸 때는 독자의 맥락을 먼저 이해해야 한다.',   zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000009', 'fixture-graph-algorithms',0, 'Graphology is a JavaScript graph library.',                                                  zeroblob(6144)),
  ('e0000001-0000-0000-0000-000000000010', 'fixture-graph-algorithms',1, 'PageRank scores nodes by connectivity. Louvain clustering groups nodes into communities.',   zeroblob(6144));

-- ── Concepts (3) ─────────────────────────────────────────────────────────────
INSERT INTO concepts (id, name, description, confidence)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'Type System',  'Static typing patterns including generics and utility types', 0.85),
  ('c0000001-0000-0000-0000-000000000002', 'Data Storage', 'Database technologies: SQLite, WAL mode, embedding stores',  0.80),
  ('c0000001-0000-0000-0000-000000000003', 'AI / ML Stack','LLM, RAG, embeddings, and vector retrieval patterns',        0.90);

-- ── concept_entities (9) ─────────────────────────────────────────────────────
-- entity_id must be INTEGER (matches entities.id)
INSERT INTO concept_entities (concept_id, entity_id)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 1),   -- TypeScript
  ('c0000001-0000-0000-0000-000000000001', 2),   -- generics
  ('c0000001-0000-0000-0000-000000000002', 3),   -- better-sqlite3
  ('c0000001-0000-0000-0000-000000000002', 4),   -- WAL mode
  ('c0000001-0000-0000-0000-000000000002', 15),  -- SQLite
  ('c0000001-0000-0000-0000-000000000003', 5),   -- OpenAI
  ('c0000001-0000-0000-0000-000000000003', 7),   -- RAG
  ('c0000001-0000-0000-0000-000000000003', 9),   -- LLM
  ('c0000001-0000-0000-0000-000000000003', 6);   -- text-embedding-3-small

-- ── qa_cards (27: note tier×5×5 + concept×3×3 + global×1×5 − some omitted for readability) ─
-- tier='note': 5 notes × 5 cards = 25 cards
-- tier='concept': 3 concepts × 1 card = 3 cards (brief; real generate-qa produces more)
-- tier='global': 2 cards
-- Total: 25 + 3 + 2 = 30 cards (≥20 required)
-- content_hash is a stable fake hash (seed.sql version tag).
INSERT INTO qa_cards (id, tier, note_id, concept_id, question, answer, content_hash)
VALUES
  -- note: fixture-ts-generics (5 cards)
  ('q0000001-0000-0000-0000-000000000001','note','fixture-ts-generics',NULL,
   'What are TypeScript generics?',
   'Generics allow you to write reusable, type-safe code by parameterising types. For example `function identity<T>(arg: T): T` preserves the exact type of its argument.',
   'seed-v1'),
  ('q0000001-0000-0000-0000-000000000002','note','fixture-ts-generics',NULL,
   'How do you constrain a generic type?',
   'Use the `extends` keyword: `function getProperty<T, K extends keyof T>(obj: T, key: K)` prevents accessing non-existent properties.',
   'seed-v1'),
  ('q0000001-0000-0000-0000-000000000003','note','fixture-ts-generics',NULL,
   'What is `Partial<T>` in TypeScript?',
   '`Partial<T>` is a utility type that makes all properties of `T` optional. It is implemented using mapped types and generics.',
   'seed-v1'),
  ('q0000001-0000-0000-0000-000000000004','note','fixture-ts-generics',NULL,
   'What is a generic interface?',
   'An interface that accepts a type parameter, e.g. `interface Repository<T> { findById(id: string): Promise<T | null> }`. Enables domain-driven design patterns.',
   'seed-v1'),
  ('q0000001-0000-0000-0000-000000000005','note','fixture-ts-generics',NULL,
   'When would you use `Pick<T, K>` over a manual interface?',
   '`Pick<T, K>` is safer because it derives from the source type — if the source changes, `Pick` catches the mismatch at compile time whereas a manual interface would not.',
   'seed-v1'),

  -- note: fixture-sqlite-patterns (5 cards)
  ('q0000002-0000-0000-0000-000000000001','note','fixture-sqlite-patterns',NULL,
   'Why use WAL mode in SQLite?',
   'Write-Ahead Logging allows concurrent reads while a write is in progress, improving throughput for read-heavy workloads without sacrificing ACID guarantees.',
   'seed-v1'),
  ('q0000002-0000-0000-0000-000000000002','note','fixture-sqlite-patterns',NULL,
   'What does `PRAGMA foreign_keys=ON` do?',
   'It enables foreign key enforcement. SQLite disables FK checks by default for backward compatibility; you must enable them per connection.',
   'seed-v1'),
  ('q0000002-0000-0000-0000-000000000003','note','fixture-sqlite-patterns',NULL,
   'What is better-sqlite3?',
   'A synchronous SQLite driver for Node.js. Unlike the async `sqlite3` package it blocks the event loop, which is acceptable for CLI build scripts and gives cleaner code.',
   'seed-v1'),
  ('q0000002-0000-0000-0000-000000000004','note','fixture-sqlite-patterns',NULL,
   'How do prepared statements improve performance?',
   'They compile SQL once and reuse the execution plan for repeated calls, avoiding repeated parse overhead. In better-sqlite3: `const stmt = db.prepare(sql); stmt.run(params)`.',
   'seed-v1'),
  ('q0000002-0000-0000-0000-000000000005','note','fixture-sqlite-patterns',NULL,
   'What is the benefit of wrapping batch writes in a transaction?',
   'SQLite commits each statement individually by default. A transaction batches them into a single disk sync, making bulk inserts ~100× faster.',
   'seed-v1'),

  -- note: fixture-rag-overview (5 cards)
  ('q0000003-0000-0000-0000-000000000001','note','fixture-rag-overview',NULL,
   'What is RAG?',
   'Retrieval-Augmented Generation: embed a query, retrieve relevant chunks from a vector store, then pass those chunks as context to an LLM for grounded answers.',
   'seed-v1'),
  ('q0000003-0000-0000-0000-000000000002','note','fixture-rag-overview',NULL,
   'What model produces 1536-dimensional embeddings?',
   'OpenAI`s `text-embedding-3-small` produces 1536-dimensional vectors at low cost. The vectors are stored as Float32Array blobs (6144 bytes each).',
   'seed-v1'),
  ('q0000003-0000-0000-0000-000000000003','note','fixture-rag-overview',NULL,
   'How does a vector store differ from a relational database?',
   'A vector store is optimised for approximate nearest-neighbour (ANN) search on high-dimensional float arrays, while a relational DB uses B-tree indexes for exact key lookups.',
   'seed-v1'),
  ('q0000003-0000-0000-0000-000000000004','note','fixture-rag-overview',NULL,
   'What is "top-k retrieval" in RAG?',
   'After embedding the query, compute cosine similarity against all stored chunk vectors and return the k most similar chunks (typically k=5–10) as context.',
   'seed-v1'),
  ('q0000003-0000-0000-0000-000000000005','note','fixture-rag-overview',NULL,
   'Why does RAG reduce hallucination?',
   'The model is grounded in retrieved facts rather than relying solely on parametric memory, so answers are constrained to the retrieved context.',
   'seed-v1'),

  -- note: fixture-글쓰기-철학 (5 cards, Korean)
  ('q0000004-0000-0000-0000-000000000001','note','fixture-글쓰기-철학',NULL,
   '개발자가 글쓰기를 배워야 하는 이유는?',
   '글쓰기는 사고를 정제하는 과정이다. 명확하게 쓸 수 없다면 명확하게 생각하지 못한다는 신호다. 문서화는 동료와의 비동기 커뮤니케이션을 가능하게 한다.',
   'seed-v1'),
  ('q0000004-0000-0000-0000-000000000002','note','fixture-글쓰기-철학',NULL,
   'TIL 형식이란 무엇인가?',
   'Today I Learned — 오늘 배운 것을 짧게 기록하는 습관이다. 지식을 누적하고, 나중에 검색 가능한 형태로 저장하는 효과적인 방법이다.',
   'seed-v1'),
  ('q0000004-0000-0000-0000-000000000003','note','fixture-글쓰기-철학',NULL,
   '독자의 맥락을 먼저 이해해야 하는 이유는?',
   '독자가 이미 알고 있는 것과 모르는 것을 파악해야 적절한 설명 깊이를 선택할 수 있다. 과도한 설명은 독자를 지치게 하고, 부족한 설명은 혼란을 야기한다.',
   'seed-v1'),
  ('q0000004-0000-0000-0000-000000000004','note','fixture-글쓰기-철학',NULL,
   '짧은 문장이 긴 설명보다 효과적인 이유는?',
   '인지 부하가 낮아지고 핵심 메시지가 명확해진다. 기술 문서에서 한 문장 = 한 아이디어 원칙을 따르면 가독성이 크게 향상된다.',
   'seed-v1'),
  ('q0000004-0000-0000-0000-000000000005','note','fixture-글쓰기-철학',NULL,
   '지식 관리에서 글쓰기의 역할은?',
   '작성 시점의 이해를 미래의 자신에게 전달하는 역할을 한다. 두 번째 뇌(second brain) 개념에서 글쓰기는 외부 기억 장치의 핵심 입력 방법이다.',
   'seed-v1'),

  -- note: fixture-graph-algorithms (5 cards)
  ('q0000005-0000-0000-0000-000000000001','note','fixture-graph-algorithms',NULL,
   'What is PageRank?',
   'A link-analysis algorithm that scores nodes by how many high-scoring nodes point to them. Originally used by Google for web search; applicable to any directed graph.',
   'seed-v1'),
  ('q0000005-0000-0000-0000-000000000002','note','fixture-graph-algorithms',NULL,
   'What is the Louvain algorithm?',
   'A greedy community-detection algorithm that maximises modularity. It groups nodes into communities by iteratively merging them if doing so increases the modularity score.',
   'seed-v1'),
  ('q0000005-0000-0000-0000-000000000003','note','fixture-graph-algorithms',NULL,
   'What is graphology?',
   'A JavaScript graph data structure library. Supports directed, undirected, and mixed graphs. Used with graphology-metrics for centrality and graphology-communities-louvain for clustering.',
   'seed-v1'),
  ('q0000005-0000-0000-0000-000000000004','note','fixture-graph-algorithms',NULL,
   'How does meshblog use PageRank?',
   'It assigns notes to display levels (L1/L2/L3) based on PageRank score: top 20% = L1, next 30% = L2, rest = L3. This drives graph visualisation density.',
   'seed-v1'),
  ('q0000005-0000-0000-0000-000000000005','note','fixture-graph-algorithms',NULL,
   'What is centrality in graph theory?',
   'A measure of how important a node is within a graph. Degree centrality counts edges; betweenness centrality counts how often a node lies on shortest paths between others.',
   'seed-v1'),

  -- concept tier (3 cards)
  ('q0000006-0000-0000-0000-000000000001','concept',NULL,'c0000001-0000-0000-0000-000000000001',
   'What unifies TypeScript generics and utility types?',
   'Both rely on parametric polymorphism — the ability to write code that operates on a type-parameter `T` determined at call/use site. Utility types are just predefined generic mappings.',
   'seed-v1'),
  ('q0000006-0000-0000-0000-000000000002','concept',NULL,'c0000001-0000-0000-0000-000000000002',
   'Why is SQLite a good fit for a static-site build pipeline?',
   'It is file-based (no server), has a synchronous driver (better-sqlite3), supports WAL for resilient incremental builds, and is zero-cost to host — ideal for a CLI build tool.',
   'seed-v1'),
  ('q0000006-0000-0000-0000-000000000003','concept',NULL,'c0000001-0000-0000-0000-000000000003',
   'How do LLM, RAG, and embeddings fit together in the AI/ML stack?',
   'Embeddings convert text to vectors for semantic search (RAG retrieval). RAG feeds retrieved context to an LLM, which generates grounded answers. The LLM is the reasoner; embeddings are the index.',
   'seed-v1'),

  -- global tier (2 cards)
  ('q0000007-0000-0000-0000-000000000001','global',NULL,NULL,
   'What is meshblog?',
   'A static knowledge-base template powered by TypeScript, SQLite, and LLMs. It extracts entities from markdown notes, builds a knowledge graph, generates Q&A cards, and exports a static site.',
   'seed-v1'),
  ('q0000007-0000-0000-0000-000000000002','global',NULL,NULL,
   'What topics does this knowledge base cover?',
   'Type systems (TypeScript generics), databases (SQLite/WAL), AI/ML (RAG, embeddings, LLMs), graph algorithms (PageRank, Louvain), and writing practices for developers.',
   'seed-v1');
