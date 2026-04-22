---
title: "PageRank for Personal Knowledge Graphs"
date: 2026-04-19
tags: [graph-theory, algorithms, knowledge-management, ranking]
---

# PageRank for Personal Knowledge Graphs

Your notes are a graph. Each note is a node. Links between notes are edges. The question is: which nodes matter most?

PageRank answers it. Not perfectly, but well enough to drive real UX decisions.

## Why Notes Are Graphs

Let's say you write about React. That note links to JavaScript (the runtime), State (a concept), and Virtual DOM (an implementation detail). Those three notes link to other notes. JavaScript links to Scope and Event Loop. State links to Immutability and Re-renders.

Now you have a graph:

```
React
  ├── JavaScript
  │   ├── Scope
  │   └── Event Loop
  ├── State
  │   ├── Immutability
  │   └── Re-renders
  └── Virtual DOM
```

If you sort by "how many notes link to this one," JavaScript wins (it's linked from React, Event Loop, Scope...). But that's just in-degree. It doesn't capture *authority*.

PageRank captures authority. A note that is referenced by important notes is itself important. "JavaScript" is important because React links to it. But React is important because hundreds of your notes eventually trace back to it (if you're doing React work).

The algorithm is recursive: a node's importance depends on the importance of nodes pointing to it.

## The Algorithm

PageRank is a random walk. Imagine a surfer on your knowledge graph, starting at a random node. At each step, the surfer follows a random outgoing link (or jumps to a random node). After millions of steps, some nodes get visited more often. Those are the important ones.

The math:

```
PR(A) = (1 - d) / N + d * sum(PR(B) / L(B))
```

Where:
- `PR(A)` = PageRank of node A
- `d` = damping factor (usually 0.85)
- `N` = total number of nodes
- `sum(PR(B) / L(B))` = sum of PageRank of nodes linking to A, divided by their outgoing link count

The damping factor is the key lever. It represents the probability that the surfer *doesn't* follow a link and instead jumps to a random node.

With `d = 0.85`:
- 85% of the time, follow a link (trust the graph structure).
- 15% of the time, jump anywhere (account for new nodes, random curiosity).

With `d = 0.95`:
- More weight on graph structure. Hubs become very important.
- Notes with few incoming links get penalized.

With `d = 0.5`:
- More weight on recency and new notes.
- Every note has a baseline importance.

## Why It Works for Notes

In Google's original PageRank paper, the "random jump" models a user getting bored and opening a new tab. In a knowledge graph, it models **new ideas**. You can't predict the future, so every note has a baseline value.

The damping factor lets you tune the tradeoff:
- **High d (0.9+)**: "The most important notes are those that many other important notes link to." This is good when your graph is mature and you trust the structure.
- **Low d (0.5-0.7)**: "We value new and recently added notes equally." This is good when your graph is growing and you don't want old hubs to dominate.

For a personal knowledge graph, I recommend `d = 0.75`. It balances "trust the structure" with "make room for new ideas."

## Implementation with graphology

```typescript
import Graph from 'graphology'
import {pagerank} from 'graphology-metrics'

// Build the graph from your notes
const graph = new Graph()

// Add nodes (notes)
notes.forEach(note => {
  graph.addNode(note.id, {title: note.title})
})

// Add edges (links)
notes.forEach(note => {
  const links = extractLinks(note.content)
  links.forEach(targetId => {
    if (graph.hasNode(targetId)) {
      graph.addEdge(note.id, targetId)
    }
  })
})

// Compute PageRank
const damping = 0.75
const pr = pagerank(graph, {alpha: damping})

// Sort by rank
const sorted = Object.entries(pr)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)

console.log('Top 10 important notes:')
sorted.forEach(([noteId, rank]) => {
  const note = notes.find(n => n.id === noteId)
  console.log(`${note.title}: ${rank.toFixed(4)}`)
})
```

The output might look like:

```
JavaScript: 0.0847
React: 0.0723
State Management: 0.0612
Functions: 0.0598
Web APIs: 0.0567
...
```

## Using the Ranking

Once you have ranks, you can drive UX decisions:

### 1. Homepage Hero

Display the top 5 most important notes in a "start here" section:

```astro
---
import { getAllNotes, computePageRank } from '../lib/graph.ts'

const notes = await getAllNotes()
const pr = computePageRank(notes)
const topNotes = pr
  .sort((a, b) => b.rank - a.rank)
  .slice(0, 5)
---

<section class="hero">
  <h2>Start Here</h2>
  {topNotes.map(note => (
    <a href={note.slug}>{note.title}</a>
  ))}
</section>
```

### 2. Related Notes (Sorted by Rank)

When you're reading "React," show related notes sorted by importance, not just randomly:

```typescript
function getRelatedNotes(noteId: string, count: number = 5) {
  const graph = buildGraph()
  const pr = computePageRank(graph)
  
  // Get neighbors in the graph
  const neighbors = getNeighbors(noteId)
  
  // Sort by PageRank
  return neighbors
    .sort((a, b) => pr[b] - pr[a])
    .slice(0, count)
}
```

### 3. Chip Selection for LLM Q&A

When generating Q&As, prioritize high-PageRank notes in your context:

```typescript
function selectContextNotes(slug: string): string {
  const graph = buildGraph()
  const pr = computePageRank(graph)
  
  // Get all reachable notes (within 2 hops)
  const reachable = bfs(graph, slug, {maxDepth: 2})
  
  // Sort by PageRank, take top 10
  const context = reachable
    .sort((a, b) => pr[b.id] - pr[a.id])
    .slice(0, 10)
    .map(note => note.content)
    .join('\n---\n')
  
  return context
}
```

The LLM then generates Q&As based on the most important related concepts, not just the closest ones. This makes better, more foundational questions.

## Handling Self-Links and Cycles

Your graph will have cycles. Note A links to B, B links to C, C links back to A. That's fine. PageRank converges even with cycles. The algorithm handles it.

But be careful with self-links (a note linking to itself). GraphQL libraries like graphology usually skip those or give them zero weight. You should too.

```typescript
notes.forEach(note => {
  const links = extractLinks(note.content)
  links.forEach(targetId => {
    if (graph.hasNode(targetId) && targetId !== note.id) {
      graph.addEdge(note.id, targetId)
    }
  })
})
```

## Damping Factor Tuning

How do you know if `d = 0.75` is right?

Run PageRank with different damping factors and see which makes intuitive sense:

```typescript
const tests = [0.5, 0.6, 0.75, 0.85, 0.95]

tests.forEach(d => {
  const pr = pagerank(graph, {alpha: d})
  const top10 = Object.entries(pr)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => notes.find(n => n.id === id)?.title)
  
  console.log(`d=${d}: ${top10.join(', ')}`)
})
```

Look at the output:
- If `d=0.95` lists only old, established notes, you're trusting history too much.
- If `d=0.5` lists mostly new notes you just added, you're not letting the graph structure speak.
- If `d=0.75` shows a mix of foundational concepts and recent deep dives, you're balanced.

## The Limitation

PageRank assumes all links are equal. In reality, a link with context ("see X for why") is different from a mention in passing. Your graph doesn't capture intent.

One way to fix this: edge weights. Instead of `graph.addEdge(A, B)`, do `graph.addEdge(A, B, {weight: 0.8})` if the link is casual, or `{weight: 1.5}` if it's foundational.

PageRank can use weighted graphs. The more you link to a note with high weight, the more important it becomes.

But in practice, uniform weight works fine for a personal knowledge graph. Your linking habits are already somewhat intentional. And the simplicity is worth it.

## Recap

PageRank is a way to automatically compute "importance" from your graph structure. High damping factors trust your links. Low damping factors make room for new ideas. Use the ranking to surface foundations, drive Q&A selection, and guide readers.

It's not perfect. It's good enough to make your knowledge graph feel alive.
