/**
 * bundle-size.test.ts — Task P0: bundle-size budget gate.
 *
 * After `bunx astro build`, reads all dist/_astro/*.js files, measures total
 * gzipped size, and asserts it stays within budget.
 *
 * Skipped when dist/ does not exist (composes with build-smoke running first).
 *
 * Budgets:
 *   - Total gzipped JS: ≤ 100 KB
 *   - No single JS file: > 80 KB gzipped
 */
import { describe, it, expect } from "vitest"
import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const REPO_ROOT = join(import.meta.dirname, "..")
const DIST = join(REPO_ROOT, "dist")
const ASTRO_DIR = join(DIST, "_astro")

const TOTAL_BUDGET_BYTES = 100 * 1024 // 100 KB
const SINGLE_FILE_BUDGET_BYTES = 80 * 1024 // 80 KB

describe.skipIf(!existsSync(DIST))("bundle size", () => {
  it("dist/_astro/*.js exists", async () => {
    expect(existsSync(ASTRO_DIR)).toBe(true)
    const files = (await readdir(ASTRO_DIR)).filter((f) => f.endsWith(".js"))
    expect(files.length).toBeGreaterThan(0)
    console.log(`Found ${files.length} JS files in dist/_astro/`)
  })

  it("total gzipped JS ≤ 100 KB", async () => {
    const files = (await readdir(ASTRO_DIR)).filter((f) => f.endsWith(".js"))

    let totalGzipped = 0
    for (const file of files) {
      const raw = await readFile(join(ASTRO_DIR, file))
      const gz = gzipSync(raw)
      totalGzipped += gz.length
    }

    const totalKB = (totalGzipped / 1024).toFixed(2)
    console.log(
      `Total gzipped JS: ${totalKB} KB / ${(TOTAL_BUDGET_BYTES / 1024).toFixed(0)} KB budget`,
    )

    expect(totalGzipped).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES)
  })

  it("no single JS file exceeds 80 KB gzipped", async () => {
    const files = (await readdir(ASTRO_DIR)).filter((f) => f.endsWith(".js"))

    const outliers: { file: string; sizeKB: string }[] = []

    for (const file of files) {
      const raw = await readFile(join(ASTRO_DIR, file))
      const gz = gzipSync(raw)
      const sizeKB = (gz.length / 1024).toFixed(2)
      console.log(`  ${file}: ${sizeKB} KB gzipped`)
      if (gz.length > SINGLE_FILE_BUDGET_BYTES) {
        outliers.push({ file, sizeKB })
      }
    }

    if (outliers.length > 0) {
      const msg = outliers
        .map((o) => `${o.file} (${o.sizeKB} KB)`)
        .join(", ")
      console.warn(`Outlier JS files exceeding 80 KB: ${msg}`)
    }

    expect(
      outliers,
      `Files exceeding 80 KB gzipped: ${outliers.map((o) => o.file).join(", ")}`,
    ).toHaveLength(0)
  })
})
