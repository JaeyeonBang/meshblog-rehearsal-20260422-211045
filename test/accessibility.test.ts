/**
 * accessibility.test.ts — Task T6: axe-core WCAG AA scan on built HTML files.
 *
 * Runs a FIXTURE build in beforeAll (same pattern as build-smoke.test.ts) so
 * it can run in isolation. When run after build-smoke.test.ts in a full suite
 * run, the second build is redundant but safe — dist/ ends up identical.
 *
 * Severity gates:
 *   critical / serious  → test FAILS
 *   moderate            → logged, does NOT fail
 *   minor               → ignored (too noisy for first-pass gate)
 */
import { describe, it, expect, beforeAll } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { Window } from "happy-dom"
import axeCore from "axe-core"

const REPO_ROOT = join(import.meta.dirname, "..")
const DIST = join(REPO_ROOT, "dist")
const TEST_DB = join(REPO_ROOT, ".data/test-smoke.db")

// ── Build helper (matches build-smoke.test.ts pattern) ───────────────────────

function run(cmd: string): void {
  execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, FIXTURE_ONLY: "1", MESHBLOG_DB: TEST_DB },
    encoding: "utf-8",
    stdio: "pipe",
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AxeResult {
  violations: AxeViolation[]
  passes: AxeRule[]
  incomplete: AxeRule[]
  inapplicable: AxeRule[]
}

interface AxeViolation {
  id: string
  impact: "minor" | "moderate" | "serious" | "critical"
  description: string
  nodes: Array<{ html: string; failureSummary?: string }>
}

interface AxeRule {
  id: string
  description: string
}

// ── axe runner ────────────────────────────────────────────────────────────────

/**
 * Run axe-core against an HTML string. Evals axe.source into a happy-dom
 * Window so axe operates on that DOM (not the Node host global).
 */
async function runAxe(html: string, pageUrl: string): Promise<AxeResult> {
  const win = new Window({
    url: pageUrl,
    settings: { disableJavaScriptEvaluation: true },
  })

  win.document.open()
  win.document.write(html)
  win.document.close()

  const axeFactory = new win.Function(
    axeCore.source + "; return axe;",
  ) as () => typeof axeCore
  const axe = axeFactory()

  const result = (await axe.run(win.document as unknown as Document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
  })) as unknown as AxeResult

  await win.happyDOM.close()
  return result
}

function formatViolation(v: AxeViolation): string {
  const nodeHtml = v.nodes
    .map((n) => `  node: ${n.html.slice(0, 120)}`)
    .join("\n")
  return `[${v.impact}] ${v.id}: ${v.description}\n${nodeHtml}`
}

// ── Page discovery (runs after build in beforeAll) ────────────────────────────

function resolvePages(): Array<{ label: string; path: string; url: string }> {
  const pages: Array<{ label: string; path: string; url: string }> = []
  const base = "https://meshblog.vercel.app"

  pages.push({
    label: "homepage (index.html)",
    path: join(DIST, "index.html"),
    url: `${base}/`,
  })

  pages.push({
    label: "404 page",
    path: join(DIST, "404.html"),
    url: `${base}/404`,
  })

  const notesDir = join(DIST, "notes")
  if (existsSync(notesDir)) {
    const slugDirs = readdirSync(notesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    const firstNote = slugDirs.find((slug) =>
      existsSync(join(notesDir, slug, "index.html")),
    )
    if (firstNote) {
      pages.push({
        label: `note page (${firstNote})`,
        path: join(notesDir, firstNote, "index.html"),
        url: `${base}/notes/${firstNote}/`,
      })
    }
  }

  const postsDir = join(DIST, "posts")
  if (existsSync(postsDir)) {
    const slugDirs = readdirSync(postsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    const firstPost = slugDirs.find((slug) =>
      existsSync(join(postsDir, slug, "index.html")),
    )
    if (firstPost) {
      pages.push({
        label: `post page (${firstPost})`,
        path: join(postsDir, firstPost, "index.html"),
        url: `${base}/posts/${firstPost}/`,
      })
    }
  }

  const graphPage = join(DIST, "graph", "index.html")
  if (existsSync(graphPage)) {
    pages.push({
      label: "graph page",
      path: graphPage,
      url: `${base}/graph/`,
    })
  }

  return pages
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("accessibility (axe-core WCAG AA)", { timeout: 180_000 }, () => {
  beforeAll(() => {
    run("FIXTURE_ONLY=1 bun run build-index")
    run("bun run export-graph")
    run("bun run build-manifest")
    run("bun run build-og")
    run("bun run build-rss")
    run("rm -rf dist node_modules/.vite")
    run("bun run build")
  }, 120_000)

  it("dist/404.html exists (T10 gate)", () => {
    expect(existsSync(join(DIST, "404.html"))).toBe(true)
  })

  it(
    "all target pages pass WCAG AA (zero critical/serious violations)",
    async () => {
      // Resolve pages here — after beforeAll has run the build
      const pages = resolvePages()

      expect(pages.length).toBeGreaterThanOrEqual(2) // at minimum homepage + 404

      let totalViolations = 0
      let totalBlocking = 0
      let totalModerate = 0

      for (const page of pages) {
        if (!existsSync(page.path)) {
          console.warn(`[a11y] SKIP: ${page.path} not found`)
          continue
        }

        const html = readFileSync(page.path, "utf-8")
        const result = await runAxe(html, page.url)

        const moderate = result.violations.filter(
          (v) => v.impact === "moderate",
        )
        const blocking = result.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        )

        totalViolations += result.violations.length
        totalBlocking += blocking.length
        totalModerate += moderate.length

        if (moderate.length > 0) {
          console.warn(`\n[a11y] MODERATE on ${page.label}:`)
          moderate.forEach((v) => console.warn(formatViolation(v)))
        }

        if (blocking.length > 0) {
          const report = blocking.map(formatViolation).join("\n\n")
          expect.fail(
            `${blocking.length} critical/serious violation(s) on ${page.label}:\n\n${report}`,
          )
        }

        console.log(
          `[a11y] ${page.label}: ` +
            `${result.violations.length} violations ` +
            `(${blocking.length} crit/serious, ${moderate.length} moderate) | ` +
            `${result.passes.length} rules passed`,
        )
      }

      console.log(
        `\n[a11y] SUMMARY: ${pages.length} pages scanned, ` +
          `${totalViolations} total violations, ` +
          `${totalBlocking} critical/serious, ${totalModerate} moderate`,
      )

      expect(totalBlocking).toBe(0)
    },
  )
})
