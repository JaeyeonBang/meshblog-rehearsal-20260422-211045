/**
 * build-smoke.test.ts — Task 12: full-build artifact smoke test.
 *
 * Proves that a complete fixture build produces every artifact we claim to ship.
 * Runs in CI as a gate. No real API calls — FIXTURE_ONLY=1 skips all LLM steps.
 *
 * Build order (writes to public/ first, then astro copies to dist/):
 *   1. FIXTURE_ONLY=1 bun run build-index  — seed DB from test/fixtures/seed.sql
 *   2. bun run export-graph                — public/graph/*.json
 *   3. bun run build-manifest              — public/notes-manifest.json
 *   4. bun run build-og                    — public/og/index.png
 *   5. bun run build-rss                   — public/atom.xml
 *   6. bun astro build                     — dist/ (copies public/ + renders pages)
 */
import { describe, it, expect, beforeAll } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "..")
const DIST = join(REPO_ROOT, "dist")
// Isolate from live DB so developer's real content survives test runs
const TEST_DB = join(REPO_ROOT, ".data/test-smoke.db")

function run(cmd: string): void {
  execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, FIXTURE_ONLY: "1", MESHBLOG_DB: TEST_DB },
    encoding: "utf-8",
    stdio: "pipe",
  })
}

describe("build smoke", { timeout: 180_000 }, () => {
  beforeAll(() => {
    // Step 1: seed DB from fixtures (no LLM calls)
    run("FIXTURE_ONLY=1 bun run build-index")

    // Step 2: export graph JSON to public/graph/
    run("bun run export-graph")

    // Step 3: build notes-manifest.json to public/
    run("bun run build-manifest")

    // Step 4: build OG PNG to public/og/
    run("bun run build-og")

    // Step 5: build Atom feed to public/
    run("bun run build-rss")

    // Step 6: astro static build — copies public/ into dist/ and renders pages
    // Clear stale vite/prerender cache to avoid ERR_MODULE_NOT_FOUND from prior runs
    run("rm -rf dist node_modules/.vite")
    run("bun run build")
  }, 120_000)

  // ── dist/index.html ──────────────────────────────────────────────────────────

  it("dist/index.html exists", () => {
    expect(existsSync(join(DIST, "index.html"))).toBe(true)
  })

  it("dist/index.html renders a hero h1 and the meshblog wordmark", () => {
    const html = readFileSync(join(DIST, "index.html"), "utf-8")
    // Editorial redesign: the wordmark is a .logo span in TopBar, and the home
    // hero uses an h1 for site-specific intro copy. Require both to be present.
    expect(html).toMatch(/<h1\b[^>]*>[^<]+<\/h1>|<h1\b[^>]*>[\s\S]*?<\/h1>/)
    expect(html).toMatch(/class="[^"]*\blogo\b[^"]*"[^>]*>meshblog/)
  })

  // ── dist/graph/index.html ────────────────────────────────────────────────────

  it("dist/graph/index.html exists (Task 11 graph page)", () => {
    expect(existsSync(join(DIST, "graph", "index.html"))).toBe(true)
  })

  // ── dist/notes/<slug>/index.html ─────────────────────────────────────────────

  it("at least one dist/notes/<slug>/index.html exists (fixture has 5 notes)", () => {
    const notesDir = join(DIST, "notes")
    expect(existsSync(notesDir)).toBe(true)

    const slugDirs = readdirSync(notesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    expect(slugDirs.length).toBeGreaterThanOrEqual(1)

    // At least one slug directory must contain index.html
    const hasHtml = slugDirs.some((slug) =>
      existsSync(join(notesDir, slug, "index.html")),
    )
    expect(hasHtml).toBe(true)
  })

  // ── dist/atom.xml ────────────────────────────────────────────────────────────

  it("dist/atom.xml exists", () => {
    expect(existsSync(join(DIST, "atom.xml"))).toBe(true)
  })

  it("dist/atom.xml starts with <?xml and contains <feed", () => {
    const xml = readFileSync(join(DIST, "atom.xml"), "utf-8")
    expect(xml.trimStart()).toMatch(/^<\?xml/)
    expect(xml).toContain("<feed")
  })

  // ── dist/og/index.png ────────────────────────────────────────────────────────

  it("dist/og/index.png exists", () => {
    expect(existsSync(join(DIST, "og", "index.png"))).toBe(true)
  })

  it("dist/og/index.png is larger than 10 KB (real PNG, not a 1×1 placeholder)", () => {
    const { size } = statSync(join(DIST, "og", "index.png"))
    expect(size).toBeGreaterThan(10 * 1024)
  })

  // ── dist/graph/note-l1.json ──────────────────────────────────────────────────

  it("dist/graph/note-l1.json exists", () => {
    expect(existsSync(join(DIST, "graph", "note-l1.json"))).toBe(true)
  })

  it("dist/graph/note-l1.json parses as JSON with nodes and links arrays", () => {
    const raw = readFileSync(join(DIST, "graph", "note-l1.json"), "utf-8")
    const json = JSON.parse(raw) as { nodes: unknown[]; links: unknown[] }
    expect(Array.isArray(json.nodes)).toBe(true)
    expect(Array.isArray(json.links)).toBe(true)
  })

  // ── dist/notes-manifest.json ─────────────────────────────────────────────────

  it("dist/notes-manifest.json exists", () => {
    expect(existsSync(join(DIST, "notes-manifest.json"))).toBe(true)
  })

  it("dist/notes-manifest.json parses as JSON and is non-empty", () => {
    const raw = readFileSync(join(DIST, "notes-manifest.json"), "utf-8")
    const manifest = JSON.parse(raw) as Record<string, unknown>
    expect(typeof manifest).toBe("object")
    expect(manifest).not.toBeNull()
    expect(Object.keys(manifest).length).toBeGreaterThan(0)
  })

  // ── T3: article page prose + metadata classes ─────────────────────────────

  it("a sampled note page has class=\"prose\" on the article element (T3)", () => {
    const notesDir = join(DIST, "notes")
    const slugDirs = readdirSync(notesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    expect(slugDirs.length).toBeGreaterThanOrEqual(1)

    // Check the first slug that has an index.html
    const slugWithHtml = slugDirs.find((slug) =>
      existsSync(join(notesDir, slug, "index.html")),
    )
    expect(slugWithHtml).toBeDefined()

    const html = readFileSync(join(notesDir, slugWithHtml!, "index.html"), "utf-8")
    // Accept either `class="prose"` alone or `class="prose ..."` (e.g. prose note-prose)
    expect(html).toMatch(/class="[^"]*\bprose\b[^"]*"/)
  })

  it("a sampled note page has .kind-badge element (T3)", () => {
    const notesDir = join(DIST, "notes")
    const slugDirs = readdirSync(notesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    const slugWithHtml = slugDirs.find((slug) =>
      existsSync(join(notesDir, slug, "index.html")),
    )
    expect(slugWithHtml).toBeDefined()

    const html = readFileSync(join(notesDir, slugWithHtml!, "index.html"), "utf-8")
    expect(html).toContain("kind-badge")
  })

  it("a sampled note page has reading-time text (T3)", () => {
    const notesDir = join(DIST, "notes")
    const slugDirs = readdirSync(notesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    const slugWithHtml = slugDirs.find((slug) =>
      existsSync(join(notesDir, slug, "index.html")),
    )
    expect(slugWithHtml).toBeDefined()

    const html = readFileSync(join(notesDir, slugWithHtml!, "index.html"), "utf-8")
    expect(html).toMatch(/\d+ min ·/)
  })
})
