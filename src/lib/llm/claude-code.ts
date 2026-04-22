/**
 * Claude Code CLI subprocess wrapper.
 * PGR-3: All LLM Q&A generation uses `claude -p` subprocess instead of OpenRouter.
 * No OPENROUTER_API_KEY needed. Auth relies on the local Claude Code session.
 */

import { spawn } from "node:child_process"
import { execSync } from "node:child_process"

/** Bump MODEL_VERSION when pinning to a new Claude Code version (FGR-2 hash key). */
export const MODEL_VERSION = "claude-code-cli"

/**
 * Call the Claude Code CLI with a prompt, returning the parsed JSON response.
 * The CLI is invoked as: `claude -p "<prompt>" --output-format json`
 */
export async function callClaude(prompt: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "json"]
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`claude exit ${code}: ${stderr.slice(0, 500)}`))
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`parse fail: ${stdout.slice(0, 200)}`))
      }
    })

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}. Install: https://docs.anthropic.com/claude-code`))
    })
  })
}

/**
 * Check that the `claude` CLI binary is available.
 * Throws a descriptive error with install link if not found.
 */
export function checkClaudeAvailable(): void {
  try {
    execSync("which claude", { stdio: "ignore" })
  } catch {
    throw new Error(
      "Claude Code CLI not found in PATH.\n" +
      "  Problem: `claude` binary is missing.\n" +
      "  Cause:   Claude Code is not installed or not on PATH.\n" +
      "  Fix:     Install from https://docs.anthropic.com/claude-code and run `claude --version` to verify.",
    )
  }
}

type RetryOptions = {
  retries?: number
  baseMs?: number
  maxMs?: number
}

/**
 * Retry an async function with exponential backoff.
 * Handles transient Claude Code CLI errors (rate limits, process errors).
 * Default: 3 retries, 1s → 2s → 4s (capped at 10s).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 3, baseMs = 1000, maxMs = 10000 } = options
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs)
        console.warn(`[claude-code] attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  throw lastError ?? new Error("retryWithBackoff: unknown error")
}
