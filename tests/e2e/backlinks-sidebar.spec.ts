/**
 * tests/e2e/backlinks-sidebar.spec.ts
 *
 * E2E tests for the backlinks sidebar section on note detail pages.
 *
 * Fixture wikilink topology (seeded by tests/e2e/_seed.ts):
 *   hub    = /notes/fixture-rag-overview    ← has 4 inbound links
 *   child-a = /notes/fixture-ts-generics   → links to hub
 *   child-b = /notes/fixture-sqlite-patterns → links to hub
 *   child-c = /notes/fixture-graph-algorithms → links to hub
 *   aliased = /notes/fixture-글쓰기-철학  → links to hub with alias "alternative alias"
 *   orphan: no inbound links (we use a note that has no wikilinks targeting it)
 *   self:   fixture-ts-generics links to itself (must NOT appear in its sidebar)
 *
 * Test IDs:
 *   E2E-BL-01  hub's sidebar shows 4 inbound links
 *   E2E-BL-02  all href values start with /meshblog/notes/
 *   E2E-BL-03  aliased source shows alias label (not the target's title)
 *   E2E-BL-04  orphan page has no backlinks section
 *   E2E-BL-05  self-reference excluded: child-a not shown in its own sidebar
 *   E2E-BL-06  aria-label="backlinks" is present on notes with backlinks
 */

import { test, expect } from '@playwright/test'

// Slugs matching test/fixtures/seed.sql IDs
const HUB_SLUG     = 'fixture-rag-overview'
const CHILD_A_SLUG = 'fixture-ts-generics'
const CHILD_C_SLUG = 'fixture-graph-algorithms'

// Orphan: fixture-graph-algorithms links OUT to hub but nothing links IN to it.
// Using it as the no-inbound-links candidate for E2E-BL-04.
const ORPHAN_SLUG  = CHILD_C_SLUG   // fixture-graph-algorithms: sends link, receives none

// Navigate helper: prepend /meshblog prefix since astro preview serves
// the site under the /meshblog base path and Playwright's baseURL resolution
// treats paths starting with '/' as absolute (replacing the base path segment).
const noteUrl = (slug: string) => `/meshblog/notes/${slug}`

test.describe('Backlinks sidebar', () => {
  /**
   * E2E-BL-01: Hub page shows all 4 inbound links
   * (child-a, child-b, child-c, aliased all point to hub)
   */
  test('E2E-BL-01: hub page shows 4 inbound backlinks', async ({ page }) => {
    await page.goto(noteUrl(HUB_SLUG))

    const section = page.locator('[aria-label="backlinks"]')
    await expect(section).toBeVisible()

    const items = section.locator('li')
    await expect(items).toHaveCount(4)
  })

  /**
   * E2E-BL-02: All backlink hrefs start with /meshblog/notes/
   */
  test('E2E-BL-02: backlink hrefs start with /meshblog/notes/', async ({ page }) => {
    await page.goto(noteUrl(HUB_SLUG))

    const links = page.locator('[aria-label="backlinks"] a')
    const count = await links.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href')
      expect(href).toBeTruthy()
      expect(href!.startsWith('/meshblog/notes/')).toBe(true)
    }
  })

  /**
   * E2E-BL-03: When source used an alias, the link label shows the alias
   * aliased note (fixture-글쓰기-철학) links to hub with alias "alternative alias"
   */
  test('E2E-BL-03: alias label renders instead of source title', async ({ page }) => {
    await page.goto(noteUrl(HUB_SLUG))

    const section = page.locator('[aria-label="backlinks"]')
    await expect(section).toBeVisible()

    // Should find a link with text "alternative alias" (the alias, not the source title)
    const aliasLink = section.locator('a', { hasText: 'alternative alias' })
    await expect(aliasLink).toBeVisible()

    // Should NOT find a link with the source note's full title
    const sourceTitle = section.locator('a', { hasText: '개발자의 글쓰기 철학' })
    await expect(sourceTitle).not.toBeVisible()
  })

  /**
   * E2E-BL-04: Orphan page (no inbound links) has no backlinks section
   * fixture-graph-algorithms receives no inbound wikilinks
   */
  test('E2E-BL-04: orphan page has no backlinks section', async ({ page }) => {
    await page.goto(noteUrl(ORPHAN_SLUG))

    const section = page.locator('[aria-label="backlinks"]')
    await expect(section).not.toBeVisible()
  })

  /**
   * E2E-BL-05: Self-reference is excluded
   * fixture-ts-generics links to itself → must NOT appear in its own backlinks sidebar
   */
  test('E2E-BL-05: self-reference excluded from own sidebar', async ({ page }) => {
    await page.goto(noteUrl(CHILD_A_SLUG))

    // fixture-ts-generics has only a self-ref wikilink (no other note links to it).
    // So the backlinks section should NOT exist (zero non-self inbound links).
    const section = page.locator('[aria-label="backlinks"]')
    await expect(section).not.toBeVisible()
  })

  /**
   * E2E-BL-06: aria-label="backlinks" contract — section is correctly labelled
   */
  test('E2E-BL-06: backlinks section has correct aria-label', async ({ page }) => {
    await page.goto(noteUrl(HUB_SLUG))

    // The element with aria-label="backlinks" must exist and contain links
    const section = page.locator('section[aria-label="backlinks"]')
    await expect(section).toBeVisible()

    // The eyebrow heading must contain "referenced by"
    const heading = section.locator('.mono-eyebrow')
    await expect(heading).toContainText('referenced by')
  })
})
