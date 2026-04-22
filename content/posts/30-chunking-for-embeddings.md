---
title: "Chunking for Embeddings: What Actually Works"
date: 2026-04-19
tags: [embeddings, rag, chunking, search, nlp]
---

# Chunking for Embeddings: What Actually Works

RAG (Retrieval-Augmented Generation) is only as good as your chunks. Split wrong, and the LLM can't find what it needs. meshblog's Q&A depends on chunking. I tried four approaches. Here's what worked.

## The Problem with Naive Chunking

Start: split by paragraph.

```markdown
# Force-Directed Graphs

The simulation loop is the core.
d3-force runs a physics engine.
Nodes repel each other.

The 60-tick pattern works best.
Run synchronously for N ticks.
Then stop.
```

Naive split:

```
Chunk 1: "The simulation loop is the core.\nd3-force runs a physics engine.\nNodes repel each other."

Chunk 2: "The 60-tick pattern works best.\nRun synchronously for N ticks.\nThen stop."
```

Query: "How do you optimize force-directed graphs?"

Embedding the query finds Chunk 1 (mentions "simulation loop" and "physics"). But the answer is in Chunk 2 ("60-tick pattern").

Retrieval fails because chunks are independent. The semantic connection between "simulation" and "optimization" is lost across the chunk boundary.

## Attempt 1: Fixed-Size Chunks (Failed)

Split by 200 tokens, no overlap.

```
Chunk 1: [0-200 tokens]
Chunk 2: [200-400 tokens]
Chunk 3: [400-600 tokens]
```

Result: worst of both worlds.
- Short sections lose context (a sentence is split mid-paragraph)
- No overlap = missing connections
- Retrieval is noisy (many chunks are borderline relevant)

Recall@5 (did the right chunk appear in the top 5 results): 45%. Bad.

## Attempt 2: Semantic Split (Overfit)

Use sentence boundaries, then merge chunks until they reach 300 tokens.

```python
sentences = text.split('.')
chunks = []
current = []
current_tokens = 0

for sent in sentences:
  tokens = len(sent.split())
  if current_tokens + tokens > 300:
    chunks.append(' '.join(current))
    current = [sent]
    current_tokens = tokens
  else:
    current.append(sent)
    current_tokens += tokens
```

Better. Respects sentence boundaries. Recall@5: 68%.

Problem: for a "what is this?" question, it works. For "how do I implement this?" (multi-step), chunks are too short. The answer spans multiple concepts.

## Attempt 3: Overlap (Works)

Same semantic split, but add 50% overlap.

```
Chunk 1: Sentences 1-5
Chunk 2: Sentences 3-8  (overlap with 1)
Chunk 3: Sentences 6-11 (overlap with 2)
```

Now, a query about "optimization and simulation" might match both Chunk 1 and Chunk 2, catching the connection.

Recall@5: 82%. Much better.

Trade-off: index size is 1.5x larger. For a small blog (8 chunks per post, 376 total chunks), that's fine. For a large corpus, it adds up.

## Attempt 4: Token-Aware with Context Padding (Current)

The real solution: chunks should represent a concept. For markdown, that's usually a heading + its subsections.

```python
def chunkText(text, maxTokens=400, overlapTokens=100):
  lines = text.split('\n')
  chunks = []
  current = []
  currentTokens = 0
  
  for i, line in enumerate(lines):
    lineTokens = len(line.split())
    
    if line.startswith('## '):
      # New section: finalize current chunk
      if current:
        chunks.append('\n'.join(current))
      current = [line]
      currentTokens = lineTokens
    elif currentTokens + lineTokens > maxTokens:
      # Chunk full: overlap and save
      chunks.append('\n'.join(current))
      # Keep last N tokens for context
      overlap = current[-overlapTokens:]
      current = overlap + [line]
      currentTokens = overlapTokens + lineTokens
    else:
      current.append(line)
      currentTokens += lineTokens
  
  if current:
    chunks.append('\n'.join(current))
  
  return chunks
```

This respects document structure. Each chunk is a conceptual unit (a section). Overlap is smart (the last few tokens of the previous chunk seed the next one).

Result for meshblog:

```
Chunk 1: "# Force-Directed Graphs in the Browser\n\nThe Simulation Loop\n..."
Chunk 2: "...O(n^2) calculation on every frame...\n\n## The 60-Tick + Stop Pattern\n..."
Chunk 3: "...simulation.stop()\n...\n## Canvas vs SVG: The Trade-off\n..."
```

Each chunk is 300-500 tokens. Overlapping tokens = 50-100. Recall@5: 91%.

When you search "how do you optimize force-directed graphs," the system retrieves:
1. Chunk 2 (mentions "O(n^2)" and "60-Tick + Stop")
2. Chunk 1 (has "Simulation Loop")
3. Chunk 3 (Canvas vs SVG, performance context)

The LLM sees chunks 1 + 2 together, connects the optimization insight to the simulation concept. Good retrieval, good generation.

## What Didn't Work (So You Don't Try It)

### Fixed-size + sliding window
Split by 200 tokens, shift by 50. Sounds smart, bloats the index 4x. Recall@5: 60%. Not worth the storage.

### Sentence-based with no structure awareness
Split every 3 sentences. Misses heading boundaries. Chunks are incoherent ("...and then the algorithm. ## Canvas vs SVG. Draws..."). Confuses the embedding model.

### BM25 pre-filtering
Use keyword search to narrow to 5 chunks, then embed. Slower (two retrieval passes) and fails on questions that don't have obvious keywords ("when should I use this?"). Stick to pure embedding.

### Aggressive overlap (80%+)
Chunks are very redundant. Index is 5x larger. Marginal gain in recall. Not worth it.

### Dynamic chunk size
Adjust chunk size based on heading depth. Sounds smart, adds complexity and inconsistency. The embedding model trains on roughly similar-sized inputs. Vary too much, and accuracy drops. Keep it simple.

## The Impact on Retrieval

meshblog's Q&A system:

```
User query: "How do I render a knowledge graph efficiently?"

1. Embed the query: (512-dim vector)
2. Search embeddings: cosine similarity top-5
3. Retrieve chunks: "Force-Directed Graphs in the Browser" (Chunk 2, 3)
4. Generate context: pass chunks 1-3 to Claude
5. Stream response: "Use Canvas, not SVG. Run the simulation for 60 synchronous ticks..."
```

With Attempt 1 (naive): retrieves irrelevant chunks about SSR and static sites.
With Attempt 3 (overlap): retrieves relevant chunks but is redundant.
With Attempt 4 (token-aware): retrieves the exact chunks needed. The answer is good.

## Why This Matters for Solo Shipping

RAG quality is gating for LLM features. If chunking is bad, the LLM hallucinates because it's missing context. Then you add filters, re-ranking, keyword boosting... and you've built a search company.

Better to chunk right from the start.

For meshblog:
- 376 chunks total
- 300-500 tokens each
- 50-100 overlap
- Index size: 1.2MB JSON
- Retrieval time: < 10ms (client-side cosine similarity)

No backend. No ML infrastructure. Just good chunking.

## The Rubric

When you're choosing a chunking strategy, ask:
1. Does each chunk represent a coherent concept?
2. Will overlap connect related ideas?
3. Does the index size matter for your delivery model (SSG vs SSR)?
4. What's the recall@5 on sample queries from your domain?

For a blog: structure-aware (heading-based) + overlap works. For scientific papers: cite boundaries + overlap. For logs: time windows + context padding. The strategy depends on the data.

meshblog uses heading-based because blog structure is predictable. If I were chunking API docs, I'd chunk by function signature. If I were chunking code, I'd chunk by function/class.

The point: chunking is not generic. It's domain-specific. Think about what a "chunk" means in your data, not just the token count.
