/**
 * Journey — Feature: passport view and area pages.
 * Runs in the guest harness (zoot.guest='1', external hosts aborted); see e2e/fixtures/harness.js.
 * Reference: docs/repo-audit.md §1.
 */
import { expect, test } from '../fixtures/harness.js'

test.describe('onboarded passport journeys', () => {
  test.use({ auth: 'onboarded' })

  test('opens the passport and shows its area page controls', async ({ page }) => {
    await page.goto('/passport')

    await expect(page.getByRole('heading', { name: 'Passport' })).toBeVisible()
    await expect(page.getByText('Jump to a page')).toBeVisible()
    await expect(page.getByRole('button', { name: /Changi/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Marina Bay/ })).toBeVisible()
  })

  test('opens a selected passport area page', async ({ page }) => {
    await page.goto('/passport')
    // The jump chips render before the flipbook; a jump is a no-op until the book exists.
    // "Next page" is enabled only once the book has rendered, so wait for it first.
    await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled({ timeout: 15_000 })
    // Centre the chip first so the fixed main nav cannot sit on top of it and intercept the click.
    const chip = page.getByRole('button', { name: /Chinatown/ })
    await chip.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await chip.click()

    // Desktop shows a two-page spread, labelled "Page 4–5 / N"; phones show "Page 4 / N".
    await expect(page.getByText(/Page \d+(–\d+)? \/ \d+/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Chinatown/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /All \d+ Chinatown places/ })).toBeVisible()
  })
})
