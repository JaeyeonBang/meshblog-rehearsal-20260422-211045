---
title: "Force-Directed Graphs in the Browser"
date: 2026-04-19
tags: [d3, react, visualization, performance, physics]
---

# Force-Directed Graphs in the Browser

meshblog renders a knowledge graph as a force-directed simulation. It's the interactive node-link visualization you see on the knowledge page. Building this without lag taught me more about the simulation loop than any D3 tutorial.

## The Simulation Loop

d3-force runs a physics engine. Nodes repel each other (many-body force), links pull neighbors together (link force), and boundaries contain the mess (bounds checking). Each frame:

1. Apply forces to each node
2. Update velocities
3. Update positions
4. Render

The naive approach: run this every frame in requestAnimationFrame. Sounds good. It isn't.

```javascript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).distance(50))
  .force('charge', d3.forceManyBody().strength(-300))
  .on('tick', () => {
    // Update DOM/Canvas every tick
    render()
  })
```

Problem: d3's many-body force uses a Barnes-Hut quadtree internally, so it's O(n log n), not the naive O(n²). That saves you from the obvious disaster. But the constant factor is still real, and running it on every animation frame for 500+ nodes plus the per-frame render is enough to make the browser stutter.

## The 60-Tick + Stop Pattern

Here's what actually works: run the simulation synchronously for N ticks (say, 60), then stop. No continuous animation. Why?

1. The positions after 60 iterations converge well enough for most graphs
2. You pay the simulation cost once, not every frame
3. The layout is deterministic (same input = same output every time)
4. SSR-friendly: run the simulation at build time, serialize positions, hydrate the client with static coords

```javascript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links)
    .id(d => d.id)
    .distance(50))
  .force('charge', d3.forceManyBody()
    .strength(-300)
    .distanceMax(200))
  .force('center', d3.forceCenter(width / 2, height / 2))

// Run synchronously
for (let i = 0; i < 60; i++) {
  simulation.tick()
}
simulation.stop()

// Now extract positions
const nodePositions = nodes.map(d => ({
  id: d.id,
  x: d.x,
  y: d.y
}))
```

After 60 ticks, the graph settles. The nodes are roughly in their final positions. No jitter, no thrashing.

On the client, you have two choices:

**Option A: Static render**
Serialize the positions. Render nodes as fixed SVG or Canvas. Click a node to highlight it. No simulation. Lightweight.

**Option B: Brief animation**
Start the simulation with pinned positions (alpha = 0 or alpha decay = 0.99 so it stops fast). Run it for 30 frames to warm up the browser, then freeze. User sees a smooth appear animation, then stability.

meshblog uses Option A (static), because:
- No runtime cost
- Deterministic layout
- SEO-friendly (server renders the graph HTML)
- Mobile-friendly (Canvas, no DOM thrashing)

## Canvas vs SVG: The Trade-off

**SVG:**
- Pros: queryable DOM, click handlers per node, accessibility
- Cons: slow with 100+ nodes, re-rendering reflows the layout tree

**Canvas:**
- Pros: draws 1000 nodes smoothly, no DOM overhead
- Cons: not queryable, need custom hit detection, accessibility harder

At N < 100: SVG is fine.
At 100 < N < 500: Canvas with hover detection (check distance from mouse to node).
At N > 500: Canvas is mandatory.

meshblog has ~50 nodes, so we use Canvas. Why? Because the interaction is simple (click a node → highlight its neighbors). Custom hit detection is trivial:

```javascript
const getNodeAtMouse = (mouseX, mouseY, nodes, nodeRadius) => {
  for (const node of nodes) {
    const dx = mouseX - node.x
    const dy = mouseY - node.y
    if (Math.sqrt(dx * dx + dy * dy) < nodeRadius + 5) {
      return node
    }
  }
  return null
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const hovered = getNodeAtMouse(mouseX, mouseY, nodes, 5)
  // Update highlight
})
```

## Performance at Scale

Real numbers from meshblog:

**50 nodes, 80 links:**
- Simulation time: 2ms
- Render time: < 1ms (Canvas)
- Total: ~3ms

**100 nodes, 150 links:**
- Simulation: 5ms
- Render: 2ms
- Total: ~7ms

**500 nodes, 900 links:**
- Simulation: 50ms (Barnes-Hut keeps it manageable)
- Render: 8ms (Canvas is fast)
- Total: ~60ms

At 500 nodes, the simulation takes a tenth of a second. That's fine for SSR (run at build time), bad for real-time animation.

**1000 nodes:**
- Simulation: 200ms+

d3's Barnes-Hut is already doing its job, so further speedup means architectural changes:
1. Reduce tick count (30 instead of 60) and accept less convergence
2. Reduce link distance and charge strength — weaker forces converge faster
3. Drop Canvas rendering and go WebGL (sigma.js, cosmos) for GPU-accelerated draw
4. Partition the graph into communities and lay each out independently

## Common Gotchas

**Alpha decay:** The simulation has an alpha value that decays over time. By default it stops when alpha < 0.005. If your graph is sparse, alpha might not decay enough. Set `simulation.alpha(0.3)` after setup to restart it.

**Pinned nodes:** You can pin a node to a fixed position by setting `node.fx` and `node.fy` before running the simulation. Pinned nodes don't move; other nodes still apply forces against them. Useful for anchoring the layout:

```javascript
nodes.forEach(node => {
  if (node.isRoot) {
    node.fx = width / 2
    node.fy = height / 2
  }
})
```

**Link distance:** Too small, nodes cluster. Too large, they spread out and never converge. 50-100px is typical for most graphs.

**Charge strength:** Default is -30. More negative = stronger repulsion = spread out graph. Less negative = tighter clustering.

## Why SSR Matters

Building the graph at compile time means:
- Zero runtime cost on the client
- Positions are consistent (no client-side randomness)
- Hydration is instant
- Works on slow devices

The downside: if you add/remove nodes, the layout changes. You'd need to rebuild. For a blog (static content), that's fine.

For a live-updating graph, you'd do partial simulation on the client: just the new nodes, add them with a force that attracts them to the nearest existing node, run 20 ticks, freeze. It's a small extra cost for dynamic content.

## The Mesh Connection

The meshblog knowledge graph drives the backlink system. Each post is a node. Related tags create edges. The force-directed layout keeps related content visually close. The simulation converges in 60 ticks because I tuned the forces: charge strength -300, link distance 50, no center force (just bounds checking). These numbers took a few iterations to find. The point: it's not magic. It's physics. Tweak the parameters until it feels right.
