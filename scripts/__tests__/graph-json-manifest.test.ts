/**
 * Task 3 — graph-json-manifest.test.ts
 *
 * Verifies that `bun run build-manifest` produces a valid notes-manifest.json.
 * Uses a dedicated fixture DB (MESHBLOG_DB override) so the live .data/index.db
 * is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, unlinkSync, readFileSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "../..")
const TEST_DB = join(REPO_ROOT, ".data/test-manifest.db")
const MANIFEST_PATH = join(REPO_ROOT, "public/notes-manifest.json")

function runCmd(cmd: string, extra: Record<string, string> = {}): string {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, MESHBLOG_DB: TEST_DB, ...extra },
    encoding: "utf-8",
  })
}

describe("build-manifest", () => {
  beforeAll(() => {
    // Clean up any stale test DB
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    for (const ext of ["-shm", "-wal"]) {
      const f = TEST_DB + ext
      if (existsSync(f)) unlinkSync(f)
    }

    // Seed fixture DB
    runCmd("bun run build-index", { FIXTURE_ONLY: "1" })

    // Generate manifest using the fixture DB
    runCmd("bun run build-manifest")
  }, 60000)

  afterAll(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    for (const ext of ["-shm", "-wal"]) {
      const f = TEST_DB + ext
      if (existsSync(f)) unlinkSync(f)
    }
  })

  it("public/notes-manifest.json exists after build-manifest", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true)
  })

  it("manifest is a valid JSON object with at least 5 entries", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf-8")
    const manifest = JSON.parse(raw)

    expect(typeof manifest).toBe("object")
    expect(manifest).not.toBeNull()
    expect(Array.isArray(manifest)).toBe(false)
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(5)
  })

  it("every entry has id, href, title, folder fields", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Record<
      string,
      { id: string; href: string; title: string; folder: string }
    >

    for (const [key, entry] of Object.entries(manifest)) {
      expect(entry, `entry ${key} should have id`).toHaveProperty("id")
      expect(entry, `entry ${key} should have href`).toHaveProperty("href")
      expect(entry, `entry ${key} should have title`).toHaveProperty("title")
      expect(entry, `entry ${key} should have folder`).toHaveProperty("folder")
    }
  })

  it("folder is 'posts' or 'notes' for every entry", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Record<
      string,
      { folder: string }
    >

    for (const [key, entry] of Object.entries(manifest)) {
      expect(
        ["posts", "notes"],
        `entry ${key} folder must be 'posts' or 'notes'`,
      ).toContain(entry.folder)
    }
  })

  it("href starts with /posts/ or /notes/ and ends with /", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Record<
      string,
      { href: string; folder: string }
    >

    for (const [key, entry] of Object.entries(manifest)) {
      const expectedPrefix = `/${entry.folder}/`
      expect(
        entry.href.startsWith(expectedPrefix),
        `entry ${key} href must start with ${expectedPrefix}`,
      ).toBe(true)
      expect(
        entry.href.endsWith("/"),
        `entry ${key} href must end with /`,
      ).toBe(true)
    }
  })

  it("object keys match the entry id field", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as Record<
      string,
      { id: string }
    >

    for (const [key, entry] of Object.entries(manifest)) {
      expect(entry.id, `manifest key must match entry id`).toBe(key)
    }
  })
})
