import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Run test files sequentially to prevent DB race between integration tests
    // that share .data/index.db (build-smoke writes; future fixture-mode reads).
    // Option A: fileParallelism: false is less invasive than per-test env var overrides.
    fileParallelism: false,
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
})
