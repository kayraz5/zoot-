/**
 * Journey — Feature: mission itinerary stop list, back-by timing, and skipping a stop.
 * Runs in the guest harness (zoot.guest='1', /api/plan built from the posted catalog); see e2e/fixtures/harness.js.
 * Reference: docs/repo-audit.md §1.
 */
import { expect, test } from '../fixtures/harness.js'

const FIXED_NOW = new Date('2030-01-15T09:00:00+08:00')

async function openGeneratedMission(page) {
  await page.clock.install({ time: FIXED_NOW })
  await page.goto('/plan')
  await page.getByLabel('Lands at Changi').fill('2030-01-15T09:30')
  await page.getByLabel('Next flight leaves').fill('2030-01-15T17:30')
  await page.getByRole('button', { name: 'Continue' }).click() // confirms the layover dialog
  await page.getByRole('button', { name: 'Build my quest' }).click()
  await expect(page).toHaveURL(/\/mission\/[^/]+$/)
}

test.describe('mission itinerary', () => {
  test.use({ auth: 'onboarded' })

  test('shows the mission stops and the time to head back', async ({ page }) => {
    await openGeneratedMission(page)

    await expect(page.getByRole('heading', { name: 'E2E Quest' })).toBeVisible()
    await expect(page.getByText(/stay \d+ min/).first()).toBeVisible()
    await expect(page.getByText(/Head back by \d{1,2}:\d{2}/)).toBeVisible()
    await expect(page.getByText(/must arrive by \d{1,2}:\d{2}/)).toBeVisible()
  })

  test('marks a mission stop as skipped when the traveller skips it', async ({ page }) => {
    await openGeneratedMission(page)

    await page.getByRole('button', { name: 'Skip' }).first().click()

    // Completed stops (stamped or skipped) collapse into one summary row; expand it to see them.
    await page.getByRole('button', { name: /1 completed stop · Show/ }).click()
    await expect(page.getByText('Skipped').first()).toBeVisible()
  })
})
