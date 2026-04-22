import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4321/meshblog' },
  webServer: {
    command: 'bun run preview',
    port: 4321,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
})
