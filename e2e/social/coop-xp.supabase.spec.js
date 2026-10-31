/**
 * Social journey (Tier 2, demo seed, one account): the co-op stamp notice.
 * The test account hosts a window, a demo traveller joins, the account stamps the first stop with
 * the browser's geolocation set there, and the demo traveller checks in at the same place
 * (dev_simulate 'checkin'). The database then awards a co-op stamp and the app shows
 * "Co-op stamp!": "You and <partners> were both at <place> for the first time. +<n> bonus XP each."
 *
 * STILL GATED (fixme unless E2E_DRAFTS=1, and then Supabase-gated as well): the database awards a
 * co-op stamp only on the first visit to a place by both members (first_stamp_here in
 * stamps_after_insert_social). A persistent test account and the demo travellers use up that first
 * visit on the first run, so the scenario cannot repeat.
 * 
 */
import { gatedDraft } from '../fixtures/draft.js'
import {
  cleanupSocial, ensureOnboarded, expect, installSupabaseHarness, requireSeed, requireSupabase, simulate, test
} from '../fixtures/supabase.js'
import {
  layoverTimes, msUntil, openMapCard, openToCompany, planLayover, SOCIAL_TIMEOUT_MS, TIMEZONE
} from '../fixtures/social.js'

test.describe('co-op stamps', () => {
  gatedDraft(test, 'Blocked: co-op stamps need a first visit at the place for both members, so the scenario cannot repeat on a persistent project')
  requireSupabase(test, ['seed'])
  test.use({ timezoneId: TIMEZONE })

  test.beforeEach(async ({ testAccount }) => { await cleanupSocial(testAccount) })
  test.afterEach(async ({ testAccount }) => { await cleanupSocial(testAccount) })

  test('shows the co-op stamp notice when a member stamps the same stop', async ({ page, context, testAccount }) => {
    test.setTimeout(SOCIAL_TIMEOUT_MS)
    await requireSeed(testAccount)
    await ensureOnboarded(testAccount, 'E2E Host')
    await page.clock.install()
    await installSupabaseHarness(page, testAccount)
    await planLayover(page, layoverTimes())
    const quest = await openToCompany(page, testAccount, 'E2E co-op quest')
    await simulate(testAccount.client, quest.id, 'guest_joins')

    const { data: row } = await testAccount.client.from('parties').select('stops').eq('id', quest.id).single()
    const first = row.stops[0]
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: first.lat, longitude: first.lng, accuracy: 10 })

    await openMapCard(page)
    await page.clock.fastForward(msUntil(quest.starts_at))
    await page.getByRole('button', { name: `Stamp ${first.name}` }).click()
    await simulate(testAccount.client, quest.id, 'checkin')

    const notice = page.getByRole('alertdialog', { name: 'Co-op stamp!' })
    await expect(notice).toBeVisible({ timeout: 30_000 })
    await expect(notice).toContainText(/You and .+ were both at .+ for the first time\. \+\d+ bonus XP each\./)
  })
})
