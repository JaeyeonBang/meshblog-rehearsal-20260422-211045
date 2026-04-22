/**
 * skill-scorer.ts — Compute skill scores from entity data.
 *
 * Porting changes from Volla:
 *   - user_id removed throughout (porting-rules: user_id removal)
 *   - $n → ? (porting-rules rule 1)
 *   - ANY($1::text[]) → IN (?,?,...) (porting-rules rule 7)
 *   - tags stored as JSON string → JSON.parse() (porting-rules rule 4)
 *   - blog_posts.tags is JSON string in SQLite
 *   - blog_posts table may not exist in Phase 2 — graceful fallback
 *   - better-sqlite3 is sync: no await on db calls
 */
import { queryMany, type Database } from "../db/index.ts"

export type ConfidenceTier = "expert" | "advanced" | "intermediate" | "beginner"

export type EvidenceSource = {
  id: string
  title: string
  type: "note" | "blog"
  slug?: string
}

export type ScoredSkill = {
  name: string
  type: string
  confidence: ConfidenceTier
  score: number
  evidence: { notes: number; blogPosts: number; connections: number }
  proofSnippet: string
  sources: EvidenceSource[]
}

export type SkillsResult = {
  skills: ScoredSkill[]
  generatedAt: string
  entityCount: number
}

type EntityRow = {
  id: number
  name: string
  entity_type: string
  description: string
  last_seen_at: string
  mention_count: number
}

function computeRecencyBonus(lastSeenAt: string): number {
  const daysSince =
    (Date.now() - new Date(lastSeenAt).getTime()) / 86_400_000
  return 10 * Math.pow(0.5, daysSince / 90)
}

const SKILL_ENTITY_TYPES = new Set(["technology", "framework", "language", "tool"])

const PROPER_NAMES: Record<string, string> = {
  "postgresql": "PostgreSQL",
  "typescript": "TypeScript",
  "javascript": "JavaScript",
  "next.js": "Next.js",
  "nextjs": "Next.js",
  "react": "React",
  "node.js": "Node.js",
  "nodejs": "Node.js",
  "vue": "Vue",
  "vue.js": "Vue.js",
  "nuxt": "Nuxt",
  "svelte": "Svelte",
  "graphql": "GraphQL",
  "mongodb": "MongoDB",
  "redis": "Redis",
  "docker": "Docker",
  "kubernetes": "Kubernetes",
  "terraform": "Terraform",
  "aws": "AWS",
  "gcp": "GCP",
  "azure": "Azure",
  "tailwindcss": "Tailwind CSS",
  "tailwind css": "Tailwind CSS",
  "supabase": "Supabase",
  "prisma": "Prisma",
  "express": "Express",
  "nestjs": "NestJS",
  "python": "Python",
  "rust": "Rust",
  "golang": "Go",
  "go": "Go",
  "java": "Java",
  "kotlin": "Kotlin",
  "swift": "Swift",
  "pgvector": "pgvector",
  "openai": "OpenAI",
  "css": "CSS",
  "html": "HTML",
  "sql": "SQL",
  "git": "Git",
  "github": "GitHub",
  "gitlab": "GitLab",
  "vercel": "Vercel",
  "vitest": "Vitest",
  "jest": "Jest",
  "webpack": "Webpack",
  "vite": "Vite",
  "bun": "Bun",
  "deno": "Deno",
  "d3.js": "D3.js",
  "tiptap": "Tiptap",
}

function toProperName(name: string): string {
  return PROPER_NAMES[name.toLowerCase()] ?? name
}

function assignTier(score: number, topScore: number): ConfidenceTier {
  const ratio = topScore > 0 ? score / topScore : 0
  if (ratio >= 0.8) return "expert"
  if (ratio >= 0.5) return "advanced"
  if (ratio >= 0.25) return "intermediate"
  return "beginner"
}

function extractProofSnippet(content: string, entityName: string): string {
  const cleaned = content
    .replace(/<[^>]*>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .trim()

  const sentences = cleaned.split(/[.!?]\s+/)
  const match = sentences.find((s) =>
    s.toLowerCase().includes(entityName.toLowerCase())
  )
  const snippet = match ?? sentences[0] ?? ""
  return snippet.slice(0, 140).trim()
}

export function computeSkills(db: Database.Database): SkillsResult {
  const allEntities = queryMany<EntityRow>(
    db,
    `SELECT id, name, entity_type, description, last_seen_at, mention_count
     FROM entities
     ORDER BY mention_count DESC
     LIMIT 200`,
    []
  )

  const entities = allEntities.filter((e) => SKILL_ENTITY_TYPES.has(e.entity_type))

  if (entities.length === 0) {
    return { skills: [], generatedAt: new Date().toISOString(), entityCount: 0 }
  }

  const entityIds = entities.map((e) => e.id)
  const entityIdPlaceholders = entityIds.map(() => "?").join(",")

  // note counts per entity
  const noteCounts = queryMany<{ entity_id: number }>(
    db,
    `SELECT entity_id FROM note_entities WHERE entity_id IN (${entityIdPlaceholders})`,
    entityIds
  )

  const noteCountMap = new Map<number, number>()
  for (const row of noteCounts) {
    noteCountMap.set(row.entity_id, (noteCountMap.get(row.entity_id) ?? 0) + 1)
  }

  // relationship counts per entity
  const relsSource = queryMany<{
    source_entity_id: number
    target_entity_id: number
  }>(
    db,
    `SELECT source_entity_id, target_entity_id FROM entity_relationships`,
    []
  )

  const relCountMap = new Map<number, number>()
  const relTypesMap = new Map<number, Set<string>>()
  const entityTypeMap = new Map<number, string>()

  for (const e of entities) {
    entityTypeMap.set(e.id, e.entity_type)
  }

  for (const rel of relsSource) {
    relCountMap.set(rel.source_entity_id, (relCountMap.get(rel.source_entity_id) ?? 0) + 1)
    relCountMap.set(rel.target_entity_id, (relCountMap.get(rel.target_entity_id) ?? 0) + 1)

    const targetType = entityTypeMap.get(rel.target_entity_id)
    const sourceType = entityTypeMap.get(rel.source_entity_id)
    if (targetType) {
      const set = relTypesMap.get(rel.source_entity_id) ?? new Set()
      set.add(targetType)
      relTypesMap.set(rel.source_entity_id, set)
    }
    if (sourceType) {
      const set = relTypesMap.get(rel.target_entity_id) ?? new Set()
      set.add(sourceType)
      relTypesMap.set(rel.target_entity_id, set)
    }
  }

  // blog post counts via tags overlap (blog_posts may not exist in Phase 2)
  const hasBlogTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='blog_posts'`)
    .get() as { name: string } | undefined

  const entityNames = entities.map((e) => e.name)
  const blogCountMap = new Map<string, number>()
  const blogSourceMap = new Map<string, EvidenceSource[]>()

  if (hasBlogTable) {
    const blogPosts = queryMany<{
      id: string
      title: string
      slug: string
      tags: string
    }>(
      db,
      `SELECT id, title, slug, tags FROM blog_posts WHERE status = 'published'`,
      []
    )

    for (const post of blogPosts) {
      // tags stored as JSON string (porting-rules rule 4)
      let postTags: string[]
      try { postTags = (JSON.parse(post.tags) as string[]).map((t) => t.toLowerCase()) }
      catch { postTags = [] }

      for (const eName of entityNames) {
        if (postTags.includes(eName.toLowerCase())) {
          blogCountMap.set(eName, (blogCountMap.get(eName) ?? 0) + 1)
          const sources = blogSourceMap.get(eName) ?? []
          if (!sources.some((s) => s.id === post.id)) {
            sources.push({ id: post.id, title: post.title, type: "blog", slug: post.slug })
          }
          blogSourceMap.set(eName, sources)
        }
      }
    }
  }

  // Score all entities
  const scored = entities.map((entity) => {
    const noteCount = noteCountMap.get(entity.id) ?? 0
    const relCount = relCountMap.get(entity.id) ?? 0
    const blogCount = blogCountMap.get(entity.name) ?? 0
    const relTypes = relTypesMap.get(entity.id) ?? new Set<string>()

    const breadth = relCount * 1.0
    const depth = noteCount * 0.5
    const visibility = blogCount * 2.0
    const recency = computeRecencyBonus(entity.last_seen_at)
    const diversity = relTypes.size >= 3 ? relTypes.size * 1.5 : 0

    return {
      entity,
      noteCount,
      blogCount,
      relCount,
      score: breadth + depth + visibility + recency + diversity,
    }
  })

  const sortedScored = scored.sort((a, b) => b.score - a.score)
  const topScore = sortedScored[0]?.score ?? 0

  const topScored = sortedScored
    .filter((s) => assignTier(s.score, topScore) !== "beginner")
    .slice(0, 5)

  const topEntityIds = topScored.map((s) => s.entity.id)

  // Get note content for proof snippets
  let entityNoteIdsMap = new Map<number, string[]>()
  let noteContentMap = new Map<string, string>()
  let noteTitleMap = new Map<string, string>()

  if (topEntityIds.length > 0) {
    const topEntityIdPlaceholders = topEntityIds.map(() => "?").join(",")
    const noteEntityLinks = queryMany<{ entity_id: number; note_id: string }>(
      db,
      `SELECT entity_id, note_id FROM note_entities WHERE entity_id IN (${topEntityIdPlaceholders})`,
      topEntityIds
    )

    for (const link of noteEntityLinks) {
      const ids = entityNoteIdsMap.get(link.entity_id) ?? []
      if (!ids.includes(link.note_id)) ids.push(link.note_id)
      entityNoteIdsMap.set(link.entity_id, ids)
    }

    const allNoteIds = [...new Set([...entityNoteIdsMap.values()].flat())]
    const notesSlice = allNoteIds.slice(0, 40)
    if (notesSlice.length > 0) {
      const notePlaceholders = notesSlice.map(() => "?").join(",")
      const notes = queryMany<{ id: string; title: string; content: string }>(
        db,
        `SELECT id, title, content FROM notes WHERE id IN (${notePlaceholders})`,
        notesSlice
      )
      for (const note of notes) {
        noteContentMap.set(note.id, note.content)
        noteTitleMap.set(note.id, note.title ?? "무제")
      }
    }
  }

  const usedSnippets = new Set<string>()

  const skills: ScoredSkill[] = topScored.map((s) => {
    const noteIds = entityNoteIdsMap.get(s.entity.id) ?? []

    let proofSnippet = ""
    for (const nid of noteIds) {
      const content = noteContentMap.get(nid) ?? ""
      const snippet = extractProofSnippet(content, s.entity.name)
      if (snippet && !usedSnippets.has(snippet)) {
        proofSnippet = snippet
        break
      }
      if (snippet && !proofSnippet) proofSnippet = snippet
    }
    if (usedSnippets.has(proofSnippet) && s.entity.description) {
      proofSnippet = s.entity.description.slice(0, 140).trim()
    }
    usedSnippets.add(proofSnippet)

    const noteSources: EvidenceSource[] = noteIds.slice(0, 3).map((nid) => ({
      id: nid,
      title: noteTitleMap.get(nid) ?? "무제",
      type: "note" as const,
    }))
    const blogSources = (blogSourceMap.get(s.entity.name) ?? []).slice(0, 3)

    return {
      name: toProperName(s.entity.name),
      type: s.entity.entity_type,
      confidence: assignTier(s.score, topScore),
      score: Math.round(s.score * 10) / 10,
      evidence: {
        notes: s.noteCount,
        blogPosts: s.blogCount,
        connections: s.relCount,
      },
      proofSnippet,
      sources: [...noteSources, ...blogSources],
    }
  })

  return {
    skills,
    generatedAt: new Date().toISOString(),
    entityCount: entities.length,
  }
}
