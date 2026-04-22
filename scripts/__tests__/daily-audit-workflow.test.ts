/**
 * tests/daily-audit-workflow.test.ts
 *
 * E2E-D6-03 — enforces the "v1 is report-only" contract at the structural
 * level by grepping the workflow YAML for forbidden auto-fix patterns and
 * asserting required scaffolding (artifact upload, cron schedule).
 *
 * If this test fails, someone introduced a source-mutating step into the
 * daily audit workflow, breaking the v1 contract.
 */

import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "../..")
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/daily-audit.yml")

function loadWorkflow(): string {
  if (!existsSync(WORKFLOW_PATH)) {
    throw new Error(`Workflow file not found at ${WORKFLOW_PATH}`)
  }
  return readFileSync(WORKFLOW_PATH, "utf-8")
}

describe("daily-audit.yml — v1 report-only contract", () => {
  it("workflow file exists at .github/workflows/daily-audit.yml", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true)
  })

  // ── Positive: required scaffolding ─────────────────────────────────────────

  it("has a schedule (cron) trigger", () => {
    const content = loadWorkflow()
    expect(content).toMatch(/schedule\s*:/)
    expect(content).toMatch(/cron\s*:/)
  })

  it("has a workflow_dispatch trigger (manual run)", () => {
    const content = loadWorkflow()
    expect(content).toMatch(/workflow_dispatch/)
  })

  it("uploads audit-report.md as an artifact", () => {
    const content = loadWorkflow()
    expect(content).toMatch(/upload-artifact/)
    expect(content).toMatch(/audit-report\.md/)
  })

  it("artifact has a retention-days setting", () => {
    const content = loadWorkflow()
    expect(content).toMatch(/retention-days\s*:\s*\d+/)
  })

  it("runs audit-report (via package.json script or direct .ts reference)", () => {
    const content = loadWorkflow()
    // Either `bun run audit-report` or direct tsx invocation
    expect(content).toMatch(/audit-report/)
  })

  it("uses Node 22", () => {
    const content = loadWorkflow()
    expect(content).toMatch(/node-version\s*:\s*22/)
  })

  it("uses bun for setup", () => {
    const content = loadWorkflow()
    expect(content).toMatch(/setup-bun/)
  })

  // ── Negative: forbidden auto-fix patterns ──────────────────────────────────

  it("does NOT contain a git commit command (no source mutations)", () => {
    const content = loadWorkflow()
    // Matches: git commit -m "fix:", git commit -m 'fix:', git commit --message etc.
    expect(content).not.toMatch(/git\s+commit/)
  })

  it("does NOT contain a git push command (no source pushes)", () => {
    const content = loadWorkflow()
    expect(content).not.toMatch(/git\s+push/)
  })

  it("does NOT contain gh pr create (no auto-PR with source diffs)", () => {
    const content = loadWorkflow()
    expect(content).not.toMatch(/gh\s+pr\s+create/)
  })

  it("does NOT contain git checkout -b (no fix branches)", () => {
    const content = loadWorkflow()
    expect(content).not.toMatch(/git\s+checkout\s+-b/)
  })

  it("does NOT write to content/ or src/ directories", () => {
    const content = loadWorkflow()
    // Heuristic: no shell redirects (> or >>) targeting content/ or src/
    expect(content).not.toMatch(/>\s*content\//)
    expect(content).not.toMatch(/>\s*src\//)
  })
})
