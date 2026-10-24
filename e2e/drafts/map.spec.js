/**
 * DRAFT — Feature: live map countdown and next-stop navigation card.
 * Status: unfinished journey draft; reference: docs/repo-audit.md §1 and Requirements 11.1–11.5, 12.3, 12.5–12.6. The harness aborts external map-tile requests.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/map.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/map.spec.js
 */
import { draft, expect, test } from '../fixtures/draft.js'

const FIXED_NOW = new Date('2030-01-15T09:00:00+08:00')

async function openGeneratedMission(page) {
  await page.clock.install({ time: FIXED_NOW })
  await page.goto('/plan')
  await page.getByLabel('Lands at Changi').fill('2030-01-15T09:30')
  await page.getByLabel('Next flight leaves').fill('2030-01-15T17:30')
  await page.getByRole('button', { name: 'Build my quest' }).click()
  await expect(page).toHaveURL(/\/mission\/[^/]+$/)
}

test.describe('live map drafts', () => {
  test.use({ auth: 'onboarded' })

  draft('shows the fixed countdown and next-stop card while map tiles are aborted', async ({ page }) => {
    await openGeneratedMission(page)
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
    await page.goto('/map')

    await expect(page.getByRole('timer')).toContainText('Time to Travel')
    await expect(page.getByRole('timer')).toContainText(/\d+:\d{2}:\d{2}/)

    await page.getByRole('button', { name: 'Show next-stop card' }).click()
    await expect(page.getByText(/Next stop \d+\/\d+/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Stamp .+/ })).toBeVisible()
  })
})
