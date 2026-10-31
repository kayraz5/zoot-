/**
 * Social journey (Tier 1, signed-in read): the open quests feed and one quest's detail page,
 * against the configured Supabase project as the test account. Reads only; the app may create a
 * profile row for the test account on its first sign-in (user store refreshProfile).
 * 
 * Gate: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, a 2xx preflight, E2E_SUPABASE_EMAIL and
 * E2E_SUPABASE_PASSWORD. Otherwise every test is skipped with the missing variable name.
 */
import { expect, installSupabaseHarness, requireSupabase, test } from '../fixtures/supabase.js'
import { TIMEZONE } from '../fixtures/social.js'

test.describe('signed-in open quests', () => {
  requireSupabase(test, ['account'])
  test.use({ timezoneId: TIMEZONE })

  test.beforeEach(async ({ page, testAccount }) => {
    await installSupabaseHarness(page, testAccount)
  })

  test('renders the open quests list', async ({ page }) => {
    await page.goto('/quests')

    await expect(page.getByRole('heading', { name: 'Open quests' })).toBeVisible()
    await expect(page.getByText('Join someone for a stop or two.')).toBeVisible()
    // Signed in, so the feed loads instead of the guest-mode notice.
    await expect(page.getByRole('heading', { name: 'Sign in to quest with others' })).toHaveCount(0)
  })

  test('opens a quest and shows its open stops', async ({ page }) => {
    await page.goto('/quests')

    const cards = page.locator('main a.quest-card')
    const empty = page.getByRole('heading', { name: /^(No open quests right now|Nothing matches)$/ })
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 20_000 })
    test.skip(await cards.count() === 0, 'Supabase-gated: no open quest on the project')

    await cards.first().click()
    await expect(page).toHaveURL(/\/quests\/[^/]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // "Open stops", or "Tap the stops you'll join" when the test account's own plan fits.
    await expect(page.getByText(/^(Open stops|Tap the stops you'll join)$/)).toBeVisible()
    await expect(page.locator('main').getByRole('listitem').first()).toBeVisible()
  })
})
