/**
 * Journey — Feature: guest onboarding and travel-style selection.
 * Runs in the guest harness (zoot.guest='1', external hosts aborted); see e2e/fixtures/harness.js.
 * Reference: docs/repo-audit.md §1.
 */
import { expect, test } from '../fixtures/harness.js'

test('lets a new guest choose a travel style and reach the plan page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a layover' }).click()

  await expect(page).toHaveURL(/\/auth\?next=\/plan$/)
  // The guest name input is labelled "Play as guest"; "Traveller name (optional)" is its placeholder.
  await page.getByLabel('Play as guest').fill('E2E Traveller')
  await page.getByRole('button', { name: 'Continue as guest' }).click()

  await expect(page).toHaveURL(/\/onboard\?next=\/plan$/)
  await page.getByRole('button', { name: 'Find the cheapest great meal' }).click()
  await page.getByRole('button', { name: 'Duck into a hawker centre' }).click()
  await page.getByRole('button', { name: 'Whatever keeps it cheap' }).click()
  await page.getByRole('button', { name: 'Kaya jam from a kopitiam' }).click()

  await expect(page.getByRole('heading', { name: 'Budget traveller' })).toBeVisible()
  await page.getByRole('button', { name: 'Plan my layover' }).click()

  await expect(page).toHaveURL(/\/plan$/)
  await expect(page.getByRole('heading', { name: 'Plan a layover' })).toBeVisible()
})
