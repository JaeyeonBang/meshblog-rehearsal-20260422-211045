/**
 * Task 12 — Test 2: porting-rules-lint (PGR-4 rule 8)
 * Reads all src/**\/*.ts and scripts/**\/*.ts files and fails if any
 * PostgreSQL-specific patterns remain (that should have been ported away).
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

function collectTsFiles(dir: string, results: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".astro") continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      collectTsFiles(fullPath, results)
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      results.push(fullPath)
    }
  }
  return results
}

// Patterns that must NOT appear in any ported file (from porting-rules.md)
const BANNED_PATTERNS: Array<{ pattern: RegExp; description: string; skipLinePattern?: RegExp }> = [
  {
    pattern: /\$[1-9]\b/,
    description: "PostgreSQL positional parameter ($1, $2 etc.) — use ? instead",
    // Skip lines where $1 appears as a regex replacement (e.g. .replace(..., "$1"))
    skipLinePattern: /\.replace\s*\(|\/\$[1-9]/,
  },
  {
    pattern: /::uuid/,
    description: "PostgreSQL ::uuid cast — use TEXT + crypto.randomUUID() in JS",
  },
  {
    pattern: /::text\[\]/,
    description: "PostgreSQL ::text[] array cast — use JSON.stringify/JSON.parse",
  },
  {
    pattern: /\bNOW\(\)/,
    description: "PostgreSQL NOW() — use datetime('now') for SQLite",
  },
  {
    pattern: /\bANY\s*\(/,
    description: "PostgreSQL ANY() predicate — use IN (?,?,...) with dynamic placeholders",
  },
  {
    pattern: /EXCLUDED\.[a-zA-Z]/,
    description: "PostgreSQL EXCLUDED.col (uppercase) in ON CONFLICT — use excluded.col (lowercase) for SQLite",
  },
]

// Files that are explicitly exempt from these checks
// (e.g., documentation about the patterns, or test files themselves)
const EXEMPT_SUFFIXES = [
  "porting-rules-lint.test.ts",
  "porting-rules.md",
]

describe("porting-rules-lint: no PostgreSQL patterns in TypeScript source", () => {
  const srcDir = join(PROJECT_ROOT, "src")
  const scriptsDir = join(PROJECT_ROOT, "scripts")

  const allFiles = [
    ...collectTsFiles(srcDir),
    ...collectTsFiles(scriptsDir),
  ].filter((f) => !EXEMPT_SUFFIXES.some((suffix) => f.endsWith(suffix)))

  it("collects TypeScript files to lint", () => {
    expect(allFiles.length).toBeGreaterThan(0)
  })

  for (const { pattern, description, skipLinePattern } of BANNED_PATTERNS) {
    it(`no file contains: ${description}`, () => {
      const violations: string[] = []
      for (const file of allFiles) {
        const content = readFileSync(file, "utf-8")
        const lines = content.split("\n")
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          // Skip comment lines (they may document the pattern)
          if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue
          // Skip lines that match the exemption pattern (e.g. regex replacements)
          if (skipLinePattern && skipLinePattern.test(line)) continue
          if (pattern.test(line)) {
            violations.push(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`)
          }
        }
      }
      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} violation(s) of: "${description}"\n` +
          violations.slice(0, 5).join("\n"),
        )
      }
    })
  }
})
