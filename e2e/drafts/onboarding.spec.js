/**
 * DRAFT — Feature: guest onboarding and travel-style selection.
 * Status: unfinished journey draft; reference: docs/repo-audit.md §1 and Requirements 11.1–11.5, 12.3.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/onboarding.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/onboarding.spec.js
 */
import { draft, expect } from '../fixtures/draft.js'

draft('lets a new guest choose a travel style and reach the plan page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a layover' }).click()

  await expect(page).toHaveURL(/\/auth\?next=%2Fplan$/)
  await page.getByLabel('Traveller name (optional)').fill('E2E Traveller')
  await page.getByRole('button', { name: 'Continue as guest' }).click()

  await expect(page).toHaveURL(/\/onboard\?next=%2Fplan$/)
  await page.getByRole('button', { name: 'Find the cheapest great meal' }).click()
  await page.getByRole('button', { name: 'Duck into a hawker centre' }).click()
  await page.getByRole('button', { name: 'Whatever keeps it cheap' }).click()
  await page.getByRole('button', { name: 'Kaya jam from a kopitiam' }).click()

  await expect(page.getByRole('heading', { name: 'Budget traveller' })).toBeVisible()
  await page.getByRole('button', { name: 'Plan my layover' }).click()

  await expect(page).toHaveURL(/\/plan$/)
  await expect(page.getByRole('heading', { name: 'Plan a layover' })).toBeVisible()
})
