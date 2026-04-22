/**
 * scripts/init.ts — D1 init skill
 *
 * One-time setup for a meshblog fork:
 *  1. Prompt for Obsidian vault absolute path (validates existence)
 *  2. Prompt for GitHub repo name (optional, auto-detects from git remote)
 *  3. Symlink content/notes/ → vault path (fallback: cpSync + fs.watch on EPERM/EACCES)
 *  4. Write .env.local template if missing
 *  5. Verify .github/workflows/deploy.yml exists (generate minimal one if not)
 *  6. Build the site: real (keyless) pipeline when the vault has notes,
 *     fixture fallback only when it's empty, then spawn `bun run dev`
 *
 * Note on readline: we use the base `node:readline` API and consume its
 * async-iterator output. The promise-based `readline/promises` wrapper hangs
 * on the second `rl.question` call under piped stdin in Bun — which made every
 * scripted rehearsal silently no-op after the first prompt.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { createInterface, type Interface as ReadlineInterface } from "node:readline"
import { execSync, spawn } from "node:child_process"

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, "..")
const CONTENT_NOTES = path.join(REPO_ROOT, "content", "notes")
const ENV_LOCAL = path.join(REPO_ROOT, ".env.local")
const DEPLOY_YML = path.join(REPO_ROOT, ".github", "workflows", "deploy.yml")

// ── Exported helper for unit tests ────────────────────────────────────────────

/**
 * Link vaultPath → target.
 * Tries fs.symlinkSync first; if it throws EPERM or EACCES (WSL→Windows mount),
 * falls back to recursive copy + fs.watch for live sync.
 */
export function linkVault(vaultPath: string, target: string): void {
  // /init is documented as one-time setup (SKILL.md). Any existing state at
  // `target` is either a stale symlink from a previous run, or the placeholder
  // content/notes/ that ships with a fresh degit — both are safe to replace.
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(target)
    } else if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true })
    }
  }

  try {
    fs.symlinkSync(vaultPath, target, "dir")
    console.log(`[init] Symlinked ${target} → ${vaultPath}`)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EPERM" || code === "EACCES") {
      console.warn(
        "[init] WARNING: symlink not permitted (WSL→Windows mount). " +
          "Falling back to recursive copy + file watch.",
      )
      // Ensure target directory exists before copying into it
      fs.mkdirSync(target, { recursive: true })
      fs.cpSync(vaultPath, target, { recursive: true })
      console.log(`[init] Copied vault contents into ${target}`)

      // Watch vault for changes and re-copy modified files
      fs.watch(vaultPath, { recursive: true }, (event, filename) => {
        if (!filename) return
        const src = path.join(vaultPath, filename)
        const dst = path.join(target, filename)
        try {
          if (fs.existsSync(src)) {
            const dstDir = path.dirname(dst)
            fs.mkdirSync(dstDir, { recursive: true })
            fs.copyFileSync(src, dst)
          }
        } catch {
          // Silently skip transient errors (file deleted mid-copy, etc.)
        }
      })
      console.log(`[init] Watch-mode active: changes in ${vaultPath} will be mirrored to ${target}`)
    } else {
      throw err
    }
  }
}

/**
 * Count markdown files under a vault, recursively. Skips dot-directories
 * (`.obsidian`, `.git`, `.trash`, …) so Obsidian metadata doesn't inflate the
 * count. Returns 0 for a missing directory — used by main() to branch between
 * the real-vault build and the fixture fallback.
 */
export function countVaultMarkdown(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let n = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      n += countVaultMarkdown(full)
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      n++
    }
  }
  return n
}

/**
 * Return a `ask(prompt)` function that reads one line per call from the
 * readline interface's async iterator. Works under both TTY and piped stdin;
 * the `readline/promises` variant hangs on the second call under piped stdin
 * in Bun (empirically verified 2026-04-22).
 */
export function createAskFn(rl: ReadlineInterface): (prompt: string) => Promise<string> {
  const iter = rl[Symbol.asyncIterator]()
  return async (prompt: string): Promise<string> => {
    process.stdout.write(prompt)
    const { value, done } = await iter.next()
    return done ? "" : String(value)
  }
}

// ── Git remote detection ───────────────────────────────────────────────────────

function detectGitRemote(): string | null {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    // Extract owner/repo from HTTPS or SSH URL
    const httpsMatch = remote.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/)
    if (httpsMatch) return httpsMatch[1]
    return null
  } catch {
    return null
  }
}

// ── .env.local ────────────────────────────────────────────────────────────────

function writeEnvLocal(): void {
  if (fs.existsSync(ENV_LOCAL)) {
    console.log("[init] .env.local already exists — skipping")
    return
  }
  const content = `# meshblog local environment
# Optional — enables embeddings + Q&A generation
# OPENAI_API_KEY=sk-...
`
  fs.writeFileSync(ENV_LOCAL, content, "utf-8")
  console.log("[init] Created .env.local template")
}

// ── deploy.yml ────────────────────────────────────────────────────────────────

const MINIMAL_DEPLOY_YML = `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.x

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Prepare runtime dirs
        run: mkdir -p .data public/graph public/og content/notes content/posts

      - name: Build (fixture fallback when OPENAI_API_KEY is absent)
        run: |
          if [ -n "\${OPENAI_API_KEY:-}" ]; then
            bun run build-all
          else
            bun run build:fixture
          fi
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`

function verifyDeployYml(repoName: string | null): void {
  if (fs.existsSync(DEPLOY_YML)) {
    console.log("[init] .github/workflows/deploy.yml already exists — leaving untouched")
    return
  }
  fs.mkdirSync(path.dirname(DEPLOY_YML), { recursive: true })
  fs.writeFileSync(DEPLOY_YML, MINIMAL_DEPLOY_YML, "utf-8")
  console.log("[init] Generated minimal .github/workflows/deploy.yml")
  if (repoName) {
    console.log(`[init] Remember to enable GitHub Pages in Settings → Pages for ${repoName}`)
  }
}

// ── Prompt helpers ────────────────────────────────────────────────────────────

type Ask = (prompt: string) => Promise<string>

async function promptVaultPath(ask: Ask): Promise<string> {
  while (true) {
    const input = (await ask("Obsidian vault absolute path: ")).trim()
    if (!input) {
      console.error("[init] Path cannot be empty. Please enter an absolute path.")
      continue
    }
    if (!path.isAbsolute(input)) {
      console.error("[init] Must be an absolute path (e.g. /home/user/MyVault or C:\\Users\\…\\MyVault).")
      continue
    }
    if (!fs.existsSync(input)) {
      console.error(`[init] Directory not found: ${input}`)
      continue
    }
    const stat = fs.statSync(input)
    if (!stat.isDirectory()) {
      console.error(`[init] Not a directory: ${input}`)
      continue
    }
    return input
  }
}

async function promptRepoName(ask: Ask): Promise<string | null> {
  const detected = detectGitRemote()
  const hint = detected ? ` [${detected}]` : " [e.g. JaeyeonBang/meshblog]"
  const input = (
    await ask(`GitHub repo name (owner/name)${hint} — Enter to ${detected ? "accept detected" : "skip"}: `)
  ).trim()

  if (!input) return detected
  if (!/^[^/]+\/[^/]+$/.test(input)) {
    console.warn("[init] Repo name should be in owner/name format — recorded as-is.")
  }
  return input
}

// ── Main entry ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n=== meshblog /init ===\n")

  const rl = createInterface({ input: process.stdin })
  const ask = createAskFn(rl)

  try {
    // 1. Vault path
    const vaultPath = await promptVaultPath(ask)

    // 2. GitHub repo name
    const repoName = await promptRepoName(ask)

    rl.close()

    console.log("")

    // 3. Link vault
    linkVault(vaultPath, CONTENT_NOTES)

    // 4. Write .env.local
    writeEnvLocal()

    // 5. Verify deploy.yml
    verifyDeployYml(repoName)

    // 6. Build the site. Keyless users still see their real vault — the
    //    fixture seed is only used when the vault is genuinely empty.
    //    Both paths need the runtime dirs that CI creates explicitly; on a
    //    fresh degit these don't exist yet.
    for (const dir of [".data", "public/graph", "public/og"]) {
      fs.mkdirSync(path.join(REPO_ROOT, dir), { recursive: true })
    }

    const vaultNotes = countVaultMarkdown(vaultPath)
    console.log(`\n[init] Vault contains ${vaultNotes} markdown file(s)`)

    if (vaultNotes === 0) {
      console.log("[init] Empty vault — falling back to fixture build")
      execSync("bun run build:fixture", {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env: { ...process.env },
      })
    } else {
      console.log("[init] Running keyless build pipeline …")
      execSync("bun run build-index -- --skip-embed --skip-concepts", {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env: { ...process.env },
      })
      execSync("bun run export-graph", {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env: { ...process.env },
      })
      execSync("bunx astro build", {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "production" },
      })
    }

    // 7. Spawn dev server (non-blocking)
    console.log("\n[init] Starting dev server …")
    const dev = spawn("bun", ["run", "dev"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      detached: false,
      env: { ...process.env },
    })
    dev.unref()

    console.log("\n[init] Done. Open: http://localhost:4321/meshblog/\n")
    process.exit(0)
  } catch (err) {
    rl.close()
    console.error("[init] Fatal error:", err)
    process.exit(1)
  }
}

// Run only when executed directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("init.ts")

if (isMain) {
  main()
}
