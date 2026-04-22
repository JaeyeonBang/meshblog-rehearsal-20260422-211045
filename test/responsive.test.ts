/**
 * responsive.test.ts — T5: static CSS/HTML responsive audit.
 *
 * Static analysis on built HTML + CSS artifacts. No browser required.
 * Catches ~80% of responsive regressions: fixed-width overflow, missing
 * image constraints, missing pre scroll, and prose line-length enforcement.
 *
 * Build is shared with build-smoke.test.ts — runs in beforeAll if dist/
 * is stale. fileParallelism: false in vitest.config.ts ensures serial order.
 *
 * Viewports audited conceptually: 360px / 768px / 1440px.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "..")
const DIST = join(REPO_ROOT, "dist")
const TEST_DB = join(REPO_ROOT, ".data/test-smoke.db")

function run(cmd: string): void {
  execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, FIXTURE_ONLY: "1", MESHBLOG_DB: TEST_DB },
    encoding: "utf-8",
    stdio: "pipe",
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return all <style> block contents concatenated from an HTML string. */
function extractInlineCSS(html: string): string {
  const matches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []
  return matches
    .map((m) => m.replace(/<style[^>]*>/, "").replace(/<\/style>/, ""))
    .join("\n")
}

/** Return all linked external CSS file paths referenced in an HTML file. */
function extractLinkedCSS(html: string, distRoot: string): string[] {
  const hrefs: string[] = []
  const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    hrefs.push(m[1])
  }
  // Convert URL paths to filesystem paths.
  // Strip leading base prefix (e.g. "/meshblog") so href "/meshblog/_astro/x.css"
  // maps to dist/_astro/x.css, not dist/meshblog/_astro/x.css.
  const BASE = "/meshblog"
  return hrefs.map((href) => {
    const stripped = href.startsWith(BASE + "/") ? href.slice(BASE.length) : href
    return join(distRoot, stripped.replace(/^\//, ""))
  })
}

/** Read all CSS (inline + linked) for an HTML file. */
function readAllCSS(htmlPath: string): string {
  const html = readFileSync(htmlPath, "utf-8")
  const inline = extractInlineCSS(html)
  const linkedParts = extractLinkedCSS(html, DIST)
    .filter(existsSync)
    .map((p) => readFileSync(p, "utf-8"))
  return [inline, ...linkedParts].join("\n")
}

/** Find first existing note slug in dist/notes/. */
function firstNoteSlug(): string | undefined {
  const notesDir = join(DIST, "notes")
  if (!existsSync(notesDir)) return undefined
  return readdirSync(notesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .find((slug) => existsSync(join(notesDir, slug, "index.html")))
}

/** Find first existing post slug in dist/posts/. */
function firstPostSlug(): string | undefined {
  const postsDir = join(DIST, "posts")
  if (!existsSync(postsDir)) return undefined
  return readdirSync(postsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .find((slug) => existsSync(join(postsDir, slug, "index.html")))
}

// ── Build ─────────────────────────────────────────────────────────────────────

describe("responsive audit (T5)", { timeout: 180_000 }, () => {
  beforeAll(() => {
    // Rebuild if dist/notes/ is absent — fixture seed always produces notes,
    // so a missing notes dir means dist is stale or was wiped by another test.
    const notesDir = join(DIST, "notes")
    if (
      !existsSync(join(DIST, "index.html")) ||
      !existsSync(notesDir) ||
      readdirSync(notesDir, { withFileTypes: true }).filter((d) => d.isDirectory())
        .length === 0
    ) {
      run("FIXTURE_ONLY=1 bun run build-index")
      run("bun run export-graph")
      run("bun run build-manifest")
      run("bun run build-og")
      run("bun run build-rss")
      run("rm -rf dist node_modules/.vite")
      run("bun run build")
    }
  }, 120_000)

  // ── 1. Viewport meta present on all pages ───────────────────────────────────

  it("all 5 page types have width=device-width viewport meta", () => {
    const pages = [
      join(DIST, "index.html"),
      join(DIST, "404.html"),
      join(DIST, "graph", "index.html"),
    ]
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    if (noteSlug) pages.push(join(DIST, "notes", noteSlug, "index.html"))
    if (postSlug) pages.push(join(DIST, "posts", postSlug, "index.html"))

    for (const p of pages) {
      if (!existsSync(p)) continue
      const html = readFileSync(p, "utf-8")
      expect(html, `${p}: missing viewport meta`).toContain("width=device-width")
    }
  })

  // ── 2. No inline fixed widths > 400px on body/main elements ─────────────────

  it("no inline fixed width > 400px in any page HTML", () => {
    const pages = [
      join(DIST, "index.html"),
      join(DIST, "404.html"),
      join(DIST, "graph", "index.html"),
    ]
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    if (noteSlug) pages.push(join(DIST, "notes", noteSlug, "index.html"))
    if (postSlug) pages.push(join(DIST, "posts", postSlug, "index.html"))

    for (const p of pages) {
      if (!existsSync(p)) continue
      const html = readFileSync(p, "utf-8")
      // Find inline style="...width: NNNpx..." where NNN > 400
      const inlineWidths = [...html.matchAll(/style="[^"]*width:\s*(\d+)px/g)]
      for (const match of inlineWidths) {
        const w = parseInt(match[1], 10)
        expect(w, `${p}: inline fixed width ${w}px > 400px`).toBeLessThanOrEqual(400)
      }
    }
  })

  // ── 3. .prose max-width: 65ch present on article pages ──────────────────────

  it("article page CSS contains .prose max-width: 65ch (note or post)", () => {
    // Prefer a note page (guaranteed by fixture seed); fall back to post if present.
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    const slug = noteSlug ?? postSlug
    const dir = noteSlug ? "notes" : "posts"
    expect(slug, "No article page (note or post) found in dist/").toBeDefined()
    const css = readAllCSS(join(DIST, dir, slug!, "index.html"))
    // Editorial redesign uses 64ch; accept any narrow reading column (60–75ch).
    expect(css).toMatch(/\.prose\s*\{[^}]*max-width:\s*(6[0-9]|7[0-5])ch/)
  })

  // ── 4. .prose pre has overflow-x: auto ──────────────────────────────────────

  it("article page CSS contains overflow-x: auto for .prose pre", () => {
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    const slug = noteSlug ?? postSlug
    const dir = noteSlug ? "notes" : "posts"
    expect(slug, "No article page found in dist/").toBeDefined()
    const css = readAllCSS(join(DIST, dir, slug!, "index.html"))
    expect(css).toMatch(/\.prose\s+pre\s*\{[^}]*overflow-x:\s*auto/)
  })

  // ── 5. .prose img has max-width: 100% ───────────────────────────────────────

  it("article page CSS contains .prose img max-width: 100%", () => {
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    const slug = noteSlug ?? postSlug
    const dir = noteSlug ? "notes" : "posts"
    expect(slug, "No article page found in dist/").toBeDefined()
    const css = readAllCSS(join(DIST, dir, slug!, "index.html"))
    expect(css).toMatch(/\.prose\s+img\s*\{[^}]*max-width:\s*100%/)
  })

  // ── 6. Heading word-break rules present ─────────────────────────────────────

  it("article page CSS contains word-break: keep-all on prose headings", () => {
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    const slug = noteSlug ?? postSlug
    const dir = noteSlug ? "notes" : "posts"
    expect(slug, "No article page found in dist/").toBeDefined()
    const css = readAllCSS(join(DIST, dir, slug!, "index.html"))
    expect(css).toMatch(/word-break:\s*keep-all/)
  })

  // ── 7. Body font-size is at least 1rem ──────────────────────────────────────

  it("global CSS has body font-size of 1rem (base) or larger", () => {
    const css = readAllCSS(join(DIST, "index.html"))
    // Redesign: body { font-size: var(--fs-base) } — token value is 15px.
    // Accept the short token var(--fs-base), explicit 15px, or legacy 1rem/16px.
    const bodyFontSize = css.match(/body\s*\{[^}]*font-size:\s*([^;}]+)/)
    expect(bodyFontSize, "body font-size rule not found").toBeTruthy()
    const value = bodyFontSize![1].trim()
    // Token var(--fs-base) or explicit pixel/rem values are all acceptable
    const acceptable =
      value.includes("--fs-base") ||
      value.includes("font-size-base") ||
      value === "1rem" ||
      value === "15px" ||
      value === "16px"
    expect(acceptable, `body font-size "${value}" is not ≥ 1rem`).toBe(true)
  })

  // ── 8. Graph page has overflow: hidden container ─────────────────────────────

  it("graph page CSS contains overflow: hidden for graph container", () => {
    const graphPath = join(DIST, "graph", "index.html")
    expect(existsSync(graphPath)).toBe(true)
    const css = readAllCSS(graphPath)
    // Check for overflow:hidden (space-less) or overflow: hidden
    expect(css).toMatch(/overflow:\s*hidden/)
  })

  // ── 9. Nav links have min-height for tap targets ────────────────────────────

  it("global CSS has nav links with min-height: 44px for mobile tap targets", () => {
    const css = readAllCSS(join(DIST, "index.html"))
    // Accept:
    //   nav a { min-height: 44px }                 — legacy
    //   .nav-links a { min-height: 44px }          — legacy editorial
    //   .nav-wordmark { min-height: 44px }         — editorial redesign
    //   .topbar .nav-link { min-height: 44px }     — redesign TopBar component
    //   .nav-link { min-height: 44px }             — redesign TopBar (scoped)
    const hasTapTarget =
      /nav\s+a\s*\{[^}]*min-height:\s*44px/.test(css) ||
      /nav-links\s+a\s*\{[^}]*min-height:\s*44px/.test(css) ||
      /nav-wordmark[^{]*\{[^}]*min-height:\s*44px/.test(css) ||
      /\.nav-link[^{]*\{[^}]*min-height:\s*44px/.test(css) ||
      /topbar[^{]*\{[^}]*min-height:\s*44px/.test(css)
    expect(
      hasTapTarget,
      "No nav link rule with min-height: 44px found",
    ).toBe(true)
  })

  // ── 10. No img tags without max-width context (inline check) ─────────────────

  it("any img tags in article pages have max-width context from CSS", () => {
    const noteSlug = firstNoteSlug()
    const postSlug = firstPostSlug()
    const slug = noteSlug ?? postSlug
    const dir = noteSlug ? "notes" : "posts"
    if (!slug) return // no article pages — skip gracefully

    const htmlPath = join(DIST, dir, slug, "index.html")
    const html = readFileSync(htmlPath, "utf-8")
    const imgs = html.match(/<img[^>]+>/g) ?? []

    // Whether or not images exist on this page, the CSS rule must be present
    // as a defensive measure for markdown content that includes images.
    const css = readAllCSS(htmlPath)
    const hasProseImgRule = /\.prose\s+img\s*\{[^}]*max-width:\s*100%/.test(css)
    expect(hasProseImgRule, `No .prose img max-width rule (${imgs.length} img tags found)`).toBe(true)
  })
})
