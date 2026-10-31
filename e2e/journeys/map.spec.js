/**
 * Journey — Feature: live map countdown and next-stop navigation card.
 * Runs in the guest harness (zoot.guest='1'); the harness aborts external map-tile requests.
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

test.describe('live map', () => {
  test.use({ auth: 'onboarded' })

  test('shows the fixed countdown and next-stop card while map tiles are aborted', async ({ page }) => {
    test.slow() // the map page loads MapLibre and WebGL; Firefox under parallel load can take a while
    await openGeneratedMission(page)
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort())
    // Firefox can be late with `load` on this page under parallel load; the assertions below wait.
    await page.goto('/map', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('timer')).toContainText('Time to Travel')
    await expect(page.getByRole('timer')).toContainText(/\d+:\d{2}:\d{2}/)

    await page.getByRole('button', { name: 'Show next-stop card' }).click()
    // The card has no "Next stop n/m" line; it shows the travel time and "Stay <n> min" for a visit.
    await expect(page.getByRole('button', { name: 'Hide next-stop card' })).toBeVisible()
    await expect(page.getByText(/Stay \d+ min/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Stamp .+/ })).toBeVisible()
  })
})
