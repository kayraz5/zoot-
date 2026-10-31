/**
 * Social journey (Tier 2, demo seed, one account): live member pins on the map.
 * 
 * The test account hosts a window, a seeded demo traveller joins (dev_simulate 'guest_joins') and
 * is placed on the map ('locate'). The browser clock moves to the window start, so the client
 * considers the quest live; RLS on party_locations checks membership, not time.
 * 
 * Member pins are divs titled "<name> (live)", and the chip appends " · <n> live".
 * After dev_simulate('guest_leaves') the pin is removed (the map re-reads locations every 20 s).
 * 
 * Gate: Tier 1 plus E2E_SUPABASE_WRITES=1 and the demo seed; otherwise skipped with the reason.
 * Writes: trips, missions, a quest, demo join/locate/leave, and the profile style/name if missing.
 * 
 * The account is cleaned up (cleanupSocial) before and after the test.
 * 
 */
import {
  cleanupSocial, ensureOnboarded, expect, installSupabaseHarness, requireSeed, requireSupabase, simulate, test
} from '../fixtures/supabase.js'
import {
  layoverTimes, msUntil, openMapCard, openToCompany, planLayover, questChip, SOCIAL_TIMEOUT_MS, TIMEZONE
} from '../fixtures/social.js'

test.describe('live member locations', () => {
  requireSupabase(test, ['seed'])
  test.use({ timezoneId: TIMEZONE })

  test.beforeEach(async ({ testAccount }) => { await cleanupSocial(testAccount) })
  test.afterEach(async ({ testAccount }) => { await cleanupSocial(testAccount) })

  test('shows a joined member pin and removes it after they leave the quest', async ({ page, testAccount }) => {
    test.setTimeout(SOCIAL_TIMEOUT_MS)
    await requireSeed(testAccount)
    await ensureOnboarded(testAccount, 'E2E Host')
    await page.clock.install() // real time now; moved to the window start below
    await installSupabaseHarness(page, testAccount)
    await planLayover(page, layoverTimes())
    const quest = await openToCompany(page, testAccount, 'E2E live quest')
    await simulate(testAccount.client, quest.id, 'guest_joins')
    await simulate(testAccount.client, quest.id, 'locate')

    await openMapCard(page)
    await page.clock.fastForward(msUntil(quest.starts_at))

    const pins = page.getByTitle(/ \(live\)$/)
    await expect(pins).toHaveCount(1, { timeout: 20_000 })
    await expect(questChip(page)).toContainText(' · 1 live')

    await simulate(testAccount.client, quest.id, 'guest_leaves')
    await page.clock.fastForward(21_000) // QuestMapLive polls locations every 20 s
    await expect(pins).toHaveCount(0, { timeout: 20_000 })
  })
})
