/**
 * Task 12 — Test 1: claude-code.ts wrapper
 * Tests happy path, exit-code-nonzero, malformed JSON, and retry logic.
 * Uses vi.mock at module level + spyOn for child_process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"
import * as childProcess from "node:child_process"

// Mock child_process module before any imports from claude-code
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}))

import { callClaude, checkClaudeAvailable, retryWithBackoff } from "../../src/lib/llm/claude-code.ts"

// ── Helpers to build fake child processes ─────────────────────────────────────

function makeChild(
  stdoutData: string,
  stderrData: string,
  exitCode: number,
): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  // Emit data asynchronously so listeners can attach first
  setImmediate(() => {
    if (stdoutData) child.stdout.emit("data", Buffer.from(stdoutData))
    if (stderrData) child.stderr.emit("data", Buffer.from(stderrData))
    child.emit("close", exitCode)
  })
  return child
}

// ── callClaude tests ──────────────────────────────────────────────────────────

describe("callClaude", () => {
  let spawnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    spawnSpy = vi.spyOn(childProcess, "spawn")
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it("happy path: resolves with parsed JSON response", async () => {
    const mockResult = { result: JSON.stringify({ faqs: [{ question: "Q?", answer: "A." }] }) }
    spawnSpy.mockReturnValueOnce(makeChild(JSON.stringify(mockResult), "", 0) as ReturnType<typeof childProcess.spawn>)

    const result = await callClaude("test prompt")
    expect(result).toEqual(mockResult)
    expect(spawnSpy).toHaveBeenCalledWith(
      "claude",
      ["-p", "test prompt", "--output-format", "json"],
      expect.objectContaining({ stdio: expect.anything() }),
    )
  })

  it("exit-code-nonzero: rejects with error containing exit code and stderr", async () => {
    spawnSpy
      .mockReturnValueOnce(makeChild("", "rate limit exceeded", 1) as ReturnType<typeof childProcess.spawn>)
      .mockReturnValueOnce(makeChild("", "rate limit exceeded", 1) as ReturnType<typeof childProcess.spawn>)

    const error1 = await callClaude("test prompt").catch((e: Error) => e)
    expect(error1).toBeInstanceOf(Error)
    expect((error1 as Error).message).toContain("claude exit 1")
    expect((error1 as Error).message).toContain("rate limit exceeded")
  })

  it("malformed JSON: rejects with parse fail error", async () => {
    spawnSpy.mockReturnValueOnce(makeChild("not valid json at all", "", 0) as ReturnType<typeof childProcess.spawn>)

    await expect(callClaude("test prompt")).rejects.toThrow("parse fail")
  })
})

// ── retryWithBackoff tests ────────────────────────────────────────────────────

describe("retryWithBackoff", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    const result = await retryWithBackoff(fn, { retries: 2, baseMs: 1 })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on failure and eventually succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("recovered")
    const result = await retryWithBackoff(fn, { retries: 2, baseMs: 1, maxMs: 10 })
    expect(result).toBe("recovered")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("throws after all retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"))
    await expect(retryWithBackoff(fn, { retries: 2, baseMs: 1, maxMs: 10 })).rejects.toThrow("always fails")
    expect(fn).toHaveBeenCalledTimes(3) // 1 attempt + 2 retries
  })
})

// ── checkClaudeAvailable tests ────────────────────────────────────────────────

describe("checkClaudeAvailable", () => {
  let execSyncSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    execSyncSpy = vi.spyOn(childProcess, "execSync")
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it("does not throw when claude binary is found", () => {
    execSyncSpy.mockReturnValue(Buffer.from("/usr/local/bin/claude\n"))
    expect(() => checkClaudeAvailable()).not.toThrow()
  })

  it("throws descriptive error when claude binary is missing", () => {
    execSyncSpy.mockImplementation(() => {
      throw new Error("not found")
    })
    expect(() => checkClaudeAvailable()).toThrow("Claude Code CLI not found")
    expect(() => checkClaudeAvailable()).toThrow("docs.anthropic.com")
  })
})
