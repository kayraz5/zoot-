/**
 * DRAFT — Feature: onboarded layover planning, generation, and return-leg safety.
 * Status: unfinished journey draft; reference: docs/repo-audit.md §1 and Requirements 11.1–11.5, 12.3.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/plan.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/plan.spec.js
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.describe('onboarded layover planning', () => {
  test.use({ auth: 'onboarded' })

  draft('lets an onboarded traveller set times and see the generated quest return leg', async ({ page }) => {
    await page.clock.install({ time: new Date('2030-01-15T09:00:00+08:00') })
    await page.goto('/plan')

    await expect(page.getByRole('heading', { name: 'Your layover' })).toBeVisible()
    await page.getByLabel('Lands at Changi').fill('2030-01-15T09:30')
    await page.getByLabel('Next flight leaves').fill('2030-01-15T17:30')
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('button', { name: 'Build my quest' }).click()

    await expect(page).toHaveURL(/\/mission\/[^/]+$/)
    await expect(page.getByRole('heading', { name: 'E2E Quest' })).toBeVisible()
    await expect(page.getByText(/Return to /)).toBeVisible()
    await expect(page.getByText(/must arrive by/)).toBeVisible()
  })
})
