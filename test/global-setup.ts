/**
 * global-setup.ts — Vitest globalSetup: runs a single FIXTURE build once
 * before any test file starts. Both build-smoke.test.ts and
 * accessibility.test.ts read from the resulting dist/ without re-building.
 *
 * Triggered via vitest.config.ts `globalSetup` option.
 *
 * Build order:
 *   1. FIXTURE_ONLY=1 bun run build-index  — seed DB from fixtures
 *   2. bun run export-graph                — public/graph/*.json
 *   3. bun run build-manifest              — public/notes-manifest.json
 *   4. bun run build-og                    — public/og/index.png
 *   5. bun run build-rss                   — public/atom.xml
 *   6. bunx astro build                    — dist/
 */
import { execSync } from "node:child_process"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "..")
const TEST_DB = join(REPO_ROOT, ".data/test-smoke.db")

function run(cmd: string): void {
  execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, FIXTURE_ONLY: "1", MESHBLOG_DB: TEST_DB },
    encoding: "utf-8",
    stdio: "pipe",
  })
}

export default async function setup(): Promise<void> {
  console.log("[global-setup] Starting FIXTURE build…")

  run("FIXTURE_ONLY=1 bun run build-index")
  run("bun run export-graph")
  run("bun run build-manifest")
  run("bun run build-og")
  run("bun run build-rss")
  run("rm -rf dist node_modules/.vite")
  run("bun run build")

  console.log("[global-setup] Build complete.")
}
