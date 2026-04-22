/**
 * tests/e2e/backlinks-graph.spec.ts
 *
 * E2E coverage for the /graph page's Backlinks mode (acceptance criterion #5).
 *
 * Preconditions (set up by pretest:e2e):
 *   - .data/index.db has 5 fixture wikilinks seeded by tests/e2e/_seed.ts
 *   - public/graph/backlinks.json mirrors those fixture edges
 *
 * Topology (from _seed.ts):
 *   hub (fixture-rag-overview) ← 4 inbound + 1 self-ref on child-a
 *   → nodes: 4 distinct notes, edges: 5
 */

import { test, expect } from '@playwright/test'

const GRAPH_URL = '/meshblog/graph'

test.describe('Backlinks graph mode', () => {
  test('E2E-BL-G-01: /graph controls expose a visible Backlinks toggle alongside Notes/Concepts', async ({ page }) => {
    await page.goto(GRAPH_URL)

    const controls = page.locator('.graph-controls')
    await expect(controls).toBeVisible()

    // All three mode radios must be visible buttons
    await expect(controls.locator('button[data-mode="note"]')).toBeVisible()
    await expect(controls.locator('button[data-mode="concept"]')).toBeVisible()
    await expect(controls.locator('button[data-mode="backlinks"]')).toBeVisible()
  })

  test('E2E-BL-G-02: clicking Backlinks toggle switches the graph to the backlinks dataset', async ({ page }) => {
    await page.goto(GRAPH_URL)

    // Click the Backlinks mode button
    await page.locator('button[data-mode="backlinks"]').click()

    // URL should carry mode=backlinks for shareability
    await expect(page).toHaveURL(/mode=backlinks/)

    // The button reflects aria-checked
    await expect(page.locator('button[data-mode="backlinks"]')).toHaveAttribute('aria-checked', 'true')

    // Graph renders at least one node (fixture seed inserts 5 edges across 4 nodes)
    // Scope to the graph region to avoid matching TopBar icon SVGs
    const graphRegion = page.locator('[aria-label="knowledge graph"]')
    const graphSvg = graphRegion.locator('svg')
    await expect(graphSvg).toBeVisible({ timeout: 10_000 })
    await expect(graphSvg.locator('g circle, circle')).not.toHaveCount(0)
  })

  test('E2E-BL-G-03: backlinks mode renders directed edges with arrowhead marker', async ({ page }) => {
    await page.goto(`${GRAPH_URL}?mode=backlinks`)

    // useForceSimulation injects <defs><marker id="arrowhead"> when directed=true
    const graphRegion = page.locator('[aria-label="knowledge graph"]')
    const arrowMarker = graphRegion.locator('marker#arrowhead')
    await expect(arrowMarker).toHaveCount(1, { timeout: 10_000 })

    // At least one <line> uses marker-end referencing the arrowhead
    const directedLine = graphRegion.locator('line[marker-end]').first()
    await expect(directedLine).toBeVisible()
  })
})
