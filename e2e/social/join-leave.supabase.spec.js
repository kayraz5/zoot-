/**
 * Social journey (Tier 2, two accounts): joining a host's quest turns the joined stops into fixed
 * blocks in the guest's plan, and going solo brings back the guest stops the join removed.
 * 
 * Host and guest plan identical layover times, so the joined stops displace the guest's own stops;
 * the removed stop names are read from the confirm sheet (no fixture names).
 * 
 * Both accounts are cleaned up (cleanupSocial) before and after each test.
 * 
 * Gate: Tier 1 plus E2E_SUPABASE_WRITES=1, E2E_SUPABASE_HOST_EMAIL and E2E_SUPABASE_HOST_PASSWORD.
 * Writes: trips, missions, a quest, a join and a leave, and the profile style/name if missing.
 * 
 */
import {
  cleanupSocial, ensureOnboarded, expect, installSupabaseHarness, requireSupabase, test
} from '../fixtures/supabase.js'
import { hostAndJoin, openAccountPage, SOCIAL_TIMEOUT_MS, TIMEZONE } from '../fixtures/social.js'

test.describe('joining and leaving a quest', () => {
  requireSupabase(test, ['writes', 'host'])
  test.use({ timezoneId: TIMEZONE })

  test.beforeEach(async ({ testAccount, hostAccount }) => {
    await cleanupSocial(testAccount)
    await cleanupSocial(hostAccount)
  })
  test.afterEach(async ({ testAccount, hostAccount }) => {
    await cleanupSocial(testAccount)
    await cleanupSocial(hostAccount)
  })

  /** Host opens a window, the guest joins it through the confirm sheet (asserts "Added", "Removed from your plan"). */
  async function joined({ browser, page, testAccount, hostAccount, baseURL }, title, body) {
    test.setTimeout(SOCIAL_TIMEOUT_MS)
    const { displayName: hostName } = await ensureOnboarded(hostAccount, 'E2E Host')
    await ensureOnboarded(testAccount, 'E2E Guest')
    const host = await openAccountPage(browser, hostAccount, baseURL)
    try {
      await installSupabaseHarness(page, testAccount)
      const result = await hostAndJoin({ hostPage: host.page, guestPage: page, hostAccount, hostName, title })
      await body({ ...result, hostName })
    } finally {
      await host.context.close()
    }
  }

  test('sends the join request and shows the joined stops as fixed blocks', async ({ browser, page, testAccount, hostAccount, baseURL }) => {
    await joined({ browser, page, testAccount, hostAccount, baseURL }, 'E2E join quest', async ({ quest, hostName }) => {
      // The join reached the server: the guest is a member of the quest.
      const { data: rows, error } = await testAccount.client.from('party_members').select('role')
        .eq('party_id', quest.id).eq('user_id', testAccount.userId)
      expect(error, 'reading the guest membership failed').toBeNull()
      expect(rows.map((r) => r.role)).toEqual(['member'])

      await page.goto('/mission')
      await expect(page.getByText(`Fixed time with ${hostName}`).first()).toBeVisible()
    })
  })

  test('leaving the quest restores stops removed by the join', async ({ browser, page, testAccount, hostAccount, baseURL }) => {
    await joined({ browser, page, testAccount, hostAccount, baseURL }, 'E2E leave quest', async ({ quest, removed, hostName }) => {
      await page.goto(`/quests/${quest.id}`)
      await page.getByRole('button', { name: 'Go solo' }).click()
      const dialog = page.getByRole('alertdialog', { name: 'Go solo?' })
      await expect(dialog).toContainText(`You'll leave ${hostName}'s quest and carry on with your own plan.`)
      await dialog.getByRole('button', { name: 'Go solo' }).click()
      await expect(dialog).toBeHidden()

      await page.goto('/mission')
      for (const name of removed) {
        await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible()
      }
      await expect(page.getByText(`Fixed time with ${hostName}`)).toHaveCount(0)
    })
  })
})
