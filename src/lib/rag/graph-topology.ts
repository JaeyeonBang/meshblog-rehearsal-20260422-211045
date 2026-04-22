import Graph from "graphology"
import louvain from "graphology-communities-louvain"
import pagerank from "graphology-metrics/centrality/pagerank"
import { queryMany, execute, type Database } from "../db/index.ts"

const MAX_COMMUNITY_FRACTION = 0.25
const MIN_SPLIT_SIZE = 10
const MAX_SPLIT_DEPTH = 2

// ── Public graph-level exports (used by export-graph scripts) ──────────────

/**
 * Run Louvain community detection on a pre-built graphology Graph.
 * Returns Map<nodeId, communityId>.
 */
export function runLouvain(graph: Graph): Map<string, number> {
  const communities: Record<string, number> = louvain(graph)
  return new Map(Object.entries(communities))
}

/**
 * Run PageRank on a pre-built graphology Graph.
 * Returns Map<nodeId, pagerankScore>.
 * getEdgeWeight=null treats all edges as weight 1 (unweighted PageRank).
 */
export function runPageRank(
  graph: Graph,
  options?: { alpha?: number; maxIterations?: number; tolerance?: number }
): Map<string, number> {
  const scores: Record<string, number> = pagerank(graph, {
    getEdgeWeight: null,
    ...options,
  })
  return new Map(Object.entries(scores))
}

/**
 * Assign levels 1/2/3 based on PageRank scores.
 * Top 20% = level 1, next 30% = level 2, remaining = level 3.
 */
export function assignLevels(
  pagerankMap: Map<string, number>
): Map<string, 1 | 2 | 3> {
  const entries = Array.from(pagerankMap.entries()).sort(
    ([, a], [, b]) => b - a
  )
  const total = entries.length
  const top20 = Math.ceil(total * 0.2)
  const next30 = Math.ceil(total * 0.3)

  const result = new Map<string, 1 | 2 | 3>()
  entries.forEach(([nodeId], idx) => {
    if (idx < top20) {
      result.set(nodeId, 1)
    } else if (idx < top20 + next30) {
      result.set(nodeId, 2)
    } else {
      result.set(nodeId, 3)
    }
  })
  return result
}

// ── Internal community detection (used by concepts.ts) ────────────────────

/**
 * Compute Louvain community assignments for the entity graph.
 * Single-user: no user_id parameter.
 *
 * Graph construction:
 *   - Edges from entity_relationships (direct semantic relationships)
 *   - Edges from note_entities co-occurrence (entities sharing a note)
 *   - Duplicate edges merged via mergeEdge() — no multi-edges
 *   - Self-loops excluded from co-occurrence (ne1.entity_id != ne2.entity_id)
 *
 * Returns Map<entityId (string), communityId> — empty if <2 entities.
 * Note: entityId is serialised as string for graphology node compatibility.
 */
export function computeEntityCommunities(
  db: Database.Database
): Map<string, number> {
  // Load all entities
  const entities = queryMany<{ id: number }>(db, `SELECT id FROM entities`, [])

  if (entities.length < 2) {
    console.info(`[graph-topology] too few entities (${entities.length}), skipping`)
    return new Map()
  }

  // Load entity_relationships edges
  const relEdges = queryMany<{ source: number; target: number }>(
    db,
    `SELECT DISTINCT source_entity_id AS source, target_entity_id AS target
     FROM entity_relationships`,
    []
  )

  // Load note_entities co-occurrence edges (entities sharing same note)
  const coEdges = queryMany<{ source: number; target: number }>(
    db,
    `SELECT DISTINCT ne1.entity_id AS source, ne2.entity_id AS target
     FROM note_entities ne1
     JOIN note_entities ne2
       ON ne1.note_id = ne2.note_id
       AND ne1.entity_id != ne2.entity_id
     LIMIT 5000`,
    []
  )

  // Build undirected graph (no multi-edges)
  const graph = new Graph({ multi: false, type: "undirected" })

  // Add all entity nodes (use string keys for graphology)
  for (const e of entities) {
    const nodeId = String(e.id)
    if (!graph.hasNode(nodeId)) graph.addNode(nodeId)
  }

  // Add edges
  for (const edge of [...relEdges, ...coEdges]) {
    const src = String(edge.source)
    const tgt = String(edge.target)
    if (src !== tgt && graph.hasNode(src) && graph.hasNode(tgt)) {
      graph.mergeEdge(src, tgt)
    }
  }

  // Separate isolates (degree 0) from connected nodes
  const isolates: string[] = []
  const connected: string[] = []
  for (const nodeId of graph.nodes()) {
    if (graph.degree(nodeId) === 0) {
      isolates.push(nodeId)
    } else {
      connected.push(nodeId)
    }
  }

  const communityMap = new Map<string, number>()

  // Run Louvain on connected subgraph only
  if (connected.length >= 2) {
    try {
      const connectedGraph = graph.copy()
      for (const isolate of isolates) {
        if (connectedGraph.hasNode(isolate)) connectedGraph.dropNode(isolate)
      }
      const communities: Record<string, number> = louvain(connectedGraph)
      for (const [nodeId, communityId] of Object.entries(communities)) {
        communityMap.set(nodeId, communityId)
      }
    } catch (err) {
      console.error("[graph-topology] Louvain failed:", err)
      return new Map()
    }
  }

  // Assign isolates to individual communities
  const maxId =
    communityMap.size > 0
      ? Array.from(communityMap.values()).reduce((a, b) => (a > b ? a : b), -1)
      : -1
  let nextId = maxId + 1
  for (const isolate of isolates) {
    communityMap.set(isolate, nextId++)
  }

  // Split oversized communities
  const split = splitOversizedCommunities(graph, communityMap, 0)

  // Stabilize community IDs: sort by size descending, re-index from 0
  const groups = new Map<number, string[]>()
  for (const [nodeId, cId] of split.entries()) {
    if (!groups.has(cId)) groups.set(cId, [])
    groups.get(cId)!.push(nodeId)
  }
  const sorted = Array.from(groups.values()).sort((a, b) => b.length - a.length)
  const result = new Map<string, number>()
  sorted.forEach((members, idx) => {
    for (const m of members) result.set(m, idx)
  })

  console.info(
    `[graph-topology] communities computed: entities=${entities.length} ` +
    `edges=${relEdges.length + coEdges.length} ` +
    `communities=${sorted.length} isolates=${isolates.length}`
  )

  return result
}

/**
 * Split oversized communities (> MAX_COMMUNITY_FRACTION of total nodes).
 * Recursively re-runs Louvain on the oversized subgraph.
 */
function splitOversizedCommunities(
  graph: Graph,
  communityMap: Map<string, number>,
  depth: number
): Map<string, number> {
  if (depth >= MAX_SPLIT_DEPTH) return communityMap

  const totalNodes = communityMap.size
  const maxSize = Math.floor(totalNodes * MAX_COMMUNITY_FRACTION)

  const groups = new Map<number, string[]>()
  for (const [nodeId, cId] of communityMap.entries()) {
    if (!groups.has(cId)) groups.set(cId, [])
    groups.get(cId)!.push(nodeId)
  }

  let needsSplit = false
  for (const members of groups.values()) {
    if (members.length > maxSize && members.length >= MIN_SPLIT_SIZE) {
      needsSplit = true
      break
    }
  }
  if (!needsSplit) return communityMap

  let nextId =
    Array.from(communityMap.values()).reduce((a, b) => (a > b ? a : b), -1) + 1
  const updated = new Map(communityMap)

  for (const [, members] of groups.entries()) {
    if (members.length <= maxSize || members.length < MIN_SPLIT_SIZE) continue

    const subgraph = new Graph({ multi: false, type: "undirected" })
    for (const m of members) subgraph.addNode(m)
    for (const m of members) {
      for (const neighbor of graph.neighbors(m)) {
        if (subgraph.hasNode(neighbor) && !subgraph.hasEdge(m, neighbor)) {
          subgraph.addEdge(m, neighbor)
        }
      }
    }

    try {
      const subCommunities: Record<string, number> = louvain(subgraph)
      const subIds = new Set(Object.values(subCommunities))
      if (subIds.size <= 1) continue

      const idMap = new Map<number, number>()
      for (const subId of subIds) {
        idMap.set(subId, nextId++)
      }
      for (const m of members) {
        const newId = idMap.get(subCommunities[m])
        if (newId !== undefined) updated.set(m, newId)
      }
    } catch {
      // Split failed — keep original community
    }
  }

  return splitOversizedCommunities(graph, updated, depth + 1)
}

/**
 * Compute degree centrality for all entities and store in DB.
 * Score = degree / maxDegree (0.0–1.0). 0 if no relationships.
 * Single-user: no user_id. Uses per-loop UPDATE (no UNNEST).
 */
export function computeAndStoreCentrality(db: Database.Database): void {
  const degrees = queryMany<{ entity_id: number; degree: number }>(
    db,
    `SELECT entity_id, COUNT(*) AS degree
     FROM (
       SELECT source_entity_id AS entity_id FROM entity_relationships
       UNION ALL
       SELECT target_entity_id AS entity_id FROM entity_relationships
     ) all_edges
     GROUP BY entity_id`,
    []
  )

  if (degrees.length === 0) {
    execute(db, `UPDATE entities SET centrality_score = 0`, [])
    return
  }

  const maxDegree = degrees.reduce((a, d) => Math.max(a, Number(d.degree)), 0)
  if (maxDegree === 0) {
    execute(db, `UPDATE entities SET centrality_score = 0`, [])
    return
  }

  const entityIds = degrees.map((d) => d.entity_id)

  // Per-row UPDATE (no UNNEST in SQLite)
  db.transaction(() => {
    for (const d of degrees) {
      const score = Number(d.degree) / maxDegree
      execute(
        db,
        `UPDATE entities SET centrality_score = ? WHERE id = ?`,
        [score, d.entity_id]
      )
    }

    // Build IN clause for entities with no relationships
    if (entityIds.length > 0) {
      const placeholders = entityIds.map(() => "?").join(",")
      execute(
        db,
        `UPDATE entities SET centrality_score = 0 WHERE id NOT IN (${placeholders})`,
        entityIds
      )
    }
  })()

  console.info(
    `[graph-topology] centrality computed: entities=${degrees.length} maxDegree=${maxDegree}`
  )
}
