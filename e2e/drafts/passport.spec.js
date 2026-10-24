/**
 * DRAFT — Feature: passport view and area pages.
 * Status: passport journey is documented for the unfinished app coverage in docs/repo-audit.md §1 and Requirements 11.1–11.5, 12.3.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/passport.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/passport.spec.js
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.describe('onboarded passport journeys', () => {
  test.use({ auth: 'onboarded' })

  draft('opens the passport and shows its area page controls', async ({ page }) => {
    await page.goto('/passport')

    await expect(page.getByRole('heading', { name: 'Passport' })).toBeVisible()
    await expect(page.getByText('Jump to a page')).toBeVisible()
    await expect(page.getByRole('button', { name: /Changi/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Marina Bay/ })).toBeVisible()
  })

  draft('opens a selected passport area page', async ({ page }) => {
    await page.goto('/passport')
    await page.getByRole('button', { name: /Chinatown/ }).click()

    await expect(page.getByText(/Page \d+ \/ \d+/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Chinatown/ })).toBeVisible()
  })
})
