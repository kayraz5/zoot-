/**
 * Journey — Feature: guest account access notice on the quests pages.
 * Runs in the guest harness (zoot.guest='1', external hosts aborted); social features are off in
 * guest mode, so the pages show the GuestModeError notice. The signed-in quest list and detail
 * journeys live in the Supabase-gated social specs.
 * Reference: docs/repo-audit.md §1–§4.
 */
import { expect, test } from '../fixtures/harness.js'

test.describe('onboarded guest quest notices', () => {
  test.use({ auth: 'onboarded' })

  test('explains that guest quests need an email account', async ({ page }) => {
    await page.goto('/quests')

    await expect(page.getByRole('heading', { name: 'Sign in to quest with others' })).toBeVisible()
    await expect(page.getByText(/Guest mode keeps everything on this phone/)).toBeVisible()

    await page.goto('/quests/e2e-quest')
    await expect(page.getByRole('heading', { name: 'Sign in to see open quests' })).toBeVisible()
    await expect(page.getByText(/Guest mode keeps everything on this phone/)).toBeVisible()
  })
})
