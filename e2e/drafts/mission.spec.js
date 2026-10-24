/**
 * DRAFT — Feature: mission itinerary stop list, back-by timing, and skipping a stop.
 * Status: unfinished journey draft; reference: docs/repo-audit.md §1 and Requirements 11.1–11.5, 12.3, 12.5–12.6.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/mission.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/mission.spec.js
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

test.describe('mission itinerary drafts', () => {
  test.use({ auth: 'onboarded' })

  draft('shows the mission stops and the time to head back', async ({ page }) => {
    await openGeneratedMission(page)

    await expect(page.getByRole('heading', { name: 'E2E Quest' })).toBeVisible()
    await expect(page.getByText(/stay \d+ min/).first()).toBeVisible()
    await expect(page.getByText(/Head back by \d{1,2}:\d{2}/)).toBeVisible()
    await expect(page.getByText(/must arrive by \d{1,2}:\d{2}/)).toBeVisible()
  })

  draft('marks a mission stop as skipped when the traveller skips it', async ({ page }) => {
    await openGeneratedMission(page)

    await page.getByRole('button', { name: 'Skip' }).first().click()

    await expect(page.getByText('Skipped').first()).toBeVisible()
  })
})
