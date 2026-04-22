---
title: "SQLite Is All You Need (for a Personal Site)"
date: 2026-04-19
tags: [sqlite, databases, infrastructure, performance]
---

# SQLite Is All You Need (for a Personal Site)

Everyone wants to talk about their database. Postgres is production. MySQL is legacy. MongoDB is for startups. But nobody wants to say the quiet part: for a personal site or small blog, SQLite is fine. Better than fine. It's the right choice.

And I mean *right*. Not a compromise. Not good enough. Right.

## The Default Assumption

When you build a web thing, the assumption is: you need a server. The server connects to a database. The database is separate. It's hosted somewhere. You pay for it monthly, even when nobody visits your site.

For Twitter, this makes sense. For Medium, this makes sense. For a personal blog that gets a few hundred visitors a month? It's overkill.

SQLite lives in a file. One file. You can version it in git (if it's small). You can back it up by copying a file. You can develop locally without any setup. The same database that runs on your laptop runs in production.

## Why SQLite Works at This Scale

### No moving parts

Postgres needs a server process. MySQL needs a server process. MongoDB needs a replica set. SQLite is a library. You call it from your code, it reads a file. Done.

This means:
- **No connection pooling headache.** Postgres maxes out at 100-200 concurrent connections by default. With SQLite + better-sqlite3, you're limited by how fast your disk can seek, which is...very fast.
- **No network latency.** Your query runs in microseconds. Network round-trip to a remote database? Milliseconds. That's 1000x slower.
- **No authentication layer.** Postgres requires passwords, SSL, connection strings. SQLite trusts the filesystem. If someone has filesystem access to your server, they have bigger problems anyway.

### WAL Mode

SQLite's default journal mode is `DELETE`, which is slow. But WAL mode (Write-Ahead Logging) is different.

```sql
PRAGMA journal_mode = WAL;
```

With WAL:
- Writes go to a separate `.wal` file first.
- Readers can read the main `.db` file while writes are happening.
- This makes SQLite *concurrency-friendly*. You can have multiple readers and a writer working simultaneously.

Performance jumps from "okay" to "good."

### better-sqlite3

The library you use matters. The default Node.js driver (`sqlite3`) is slow because it runs SQLite in a separate thread and uses a queue for all queries.

`better-sqlite3` is different. It's a native binding that runs synchronously in your main thread.

```typescript
// sqlite3 (slow)
db.all('SELECT * FROM posts', (err, rows) => {
  console.log(rows)
})
// Async, queued, slow for many small queries

// better-sqlite3 (fast)
const rows = db.prepare('SELECT * FROM posts').all()
console.log(rows)
// Synchronous, immediate, thousands of queries/sec
```

For a blog, synchronous is fine. You're not handling millions of concurrent requests. And the simplicity is worth it.

## Content Hashing for Cache Invalidation

The hardest problem in computer science is cache invalidation. With SQLite, you can solve it elegantly.

Every time you write content, compute its hash. Store it in the database.

```typescript
import crypto from 'crypto'

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

// When you rebuild
const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug)
const currentHash = hashContent(post.content)
const storedHash = post.content_hash

if (currentHash !== storedHash) {
  // Content changed, rebuild pages that depend on this post
  invalidateCache(['/', `/posts/${slug}`, '/posts.json'])
  
  // Update the hash
  db.prepare('UPDATE posts SET content_hash = ? WHERE slug = ?')
    .run(currentHash, slug)
}
```

Now you don't invalidate the entire site cache when you change one post. You only invalidate what changed.

```typescript
// At build time
const db = openDatabase('./content.db')

const posts = db.prepare('SELECT * FROM posts').all()
const pageHashes = {}

posts.forEach(post => {
  const pageHash = computePageHash(post)
  pageHashes[post.slug] = pageHash
})

// Build only pages whose hash changed
const pagesToBuild = Object.entries(pageHashes)
  .filter(([slug, hash]) => {
    const prevHash = db.prepare('SELECT hash FROM built_pages WHERE slug = ?').get(slug)?.hash
    return hash !== prevHash
  })
  .map(([slug]) => slug)

// Build only those pages
pagesToBuild.forEach(slug => buildPage(slug))

// Update the database
db.transaction(() => {
  Object.entries(pageHashes).forEach(([slug, hash]) => {
    db.prepare('INSERT OR REPLACE INTO built_pages (slug, hash) VALUES (?, ?)')
      .run(slug, hash)
  })
})()
```

This turns your build from "rebuild the whole site" to "rebuild only what changed." With a 500-page site, your build time goes from 30 seconds to 2 seconds.

## Shipping the Database

When you deploy, you ship the SQLite file as a build artifact.

```bash
# Astro build
npm run build
# This creates:
# - dist/              (static HTML/CSS/JS)
# - dist/data.db       (SQLite database)

# Deploy
rsync -avz dist/ user@server:/var/www/meshblog/
```

Or, if you're using a static host (Netlify, Vercel, etc.), you can't ship a database. So you pre-generate everything to static JSON.

```typescript
// At build time, query the database and export JSON
const posts = db.prepare('SELECT * FROM posts').all()
const qa = db.prepare('SELECT * FROM qa_pairs').all()

fs.writeFileSync('dist/posts.json', JSON.stringify(posts))
fs.writeFileSync('dist/qa.json', JSON.stringify(qa))
```

Now your static host serves JSON files instead of dynamic queries. Same result, no server required.

## Real Example: meshblog's Schema

```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  date TEXT NOT NULL,
  tags TEXT,  -- JSON array stored as string
  content_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE links (
  source_post_id TEXT NOT NULL,
  target_post_id TEXT NOT NULL,
  PRIMARY KEY (source_post_id, target_post_id),
  FOREIGN KEY (source_post_id) REFERENCES posts(id),
  FOREIGN KEY (target_post_id) REFERENCES posts(id)
);

CREATE TABLE qa_pairs (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tier TEXT,  -- 'note', 'concept', 'global'
  embedding BLOB,  -- Vector embedding (stored as binary)
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE TABLE pagerank_cache (
  post_id TEXT PRIMARY KEY,
  rank REAL,
  computed_at TEXT,
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

-- Indexes for common queries
CREATE INDEX idx_posts_date ON posts(date);
CREATE INDEX idx_links_target ON links(target_post_id);
CREATE INDEX idx_qa_post ON qa_pairs(post_id);
```

This is a real schema from meshblog. Total size: usually under 5MB for 100+ posts with embeddings and Q&A. Hosting cost per month: free (it's just files).

## When to Outgrow SQLite

At some point, you might want to move to Postgres. When?

- **Concurrent writes exceed 1,000/sec.** SQLite is single-writer at the OS level. WAL mode helps, but at extreme write volumes, you hit the ceiling.
- **Data size exceeds 10GB.** SQLite doesn't have issues at this size, but queries get slower and your file backup becomes unwieldy.
- **You need multi-server replication.** SQLite is single-file, single-server. If you want HA (high availability), you need Postgres.

For a personal site? You'll never hit these limits. A blog with 1,000 posts, each with embeddings, is maybe 50MB.

## The Unspoken Truth

Developers love complex setups. Postgres connections, Docker containers, managed database services. It feels professional. It feels like you're shipping something real.

But the simplest setup is often the best. SQLite + better-sqlite3 + WAL mode + content hashing is simple enough to understand completely, fast enough to serve thousands of visitors, and small enough to be deployable anywhere.

It's not a compromise. It's the right tool for the job.

Ship it.
