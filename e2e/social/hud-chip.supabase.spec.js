/**
 * Social journey (Tier 2, two accounts): the map quest chip for a guest who joined a host's quest.
 * The host account plans a layover and opens its stops through OpenToCompanySheet; the test
 * account plans the same layover and joins from /quests/<id>. Both accounts are cleaned up
 * (cleanupSocial) before and after each test.
 * 
 * Gate: Tier 1 plus E2E_SUPABASE_WRITES=1, E2E_SUPABASE_HOST_EMAIL and E2E_SUPABASE_HOST_PASSWORD.
 * Writes: trips, missions, a quest, a join, and the profile style/name if missing.
 * 
 * The browser clock (page.clock) moves the client to the window's start and end; the server only
 * lets hosts open stops 15+ min ahead, so "started" and "ended" are client-side states.
 * 
 */
import { gatedDraft } from '../fixtures/draft.js'
import {
  cleanupSocial, ensureOnboarded, expect, installSupabaseHarness, requireSupabase, test
} from '../fixtures/supabase.js'
import {
  escapeRe, hostAndJoin, msUntil, openAccountPage, openMapCard, questChip, SOCIAL_TIMEOUT_MS, TIMEZONE
} from '../fixtures/social.js'

const HHMM = String.raw`\d{1,2}:\d{2}`

/** Host + guest pages, a joined quest, and cleanup around the body. */
async function withJoinedQuest({ browser, page, testAccount, hostAccount, baseURL }, title, body) {
  test.setTimeout(SOCIAL_TIMEOUT_MS)
  const { displayName: hostName } = await ensureOnboarded(hostAccount, 'E2E Host')
  await ensureOnboarded(testAccount, 'E2E Guest')
  const host = await openAccountPage(browser, hostAccount, baseURL)
  try {
    await page.clock.install() // real time now; tests move it forward
    await installSupabaseHarness(page, testAccount)
    const joined = await hostAndJoin({ hostPage: host.page, guestPage: page, hostAccount, hostName, title })
    await body({ ...joined, hostName })
  } finally {
    await host.context.close()
  }
}

test.describe('joined quest map chip', () => {
  test.use({ timezoneId: TIMEZONE })

  test.beforeEach(async ({ testAccount, hostAccount }) => {
    await cleanupSocial(testAccount)
    await cleanupSocial(hostAccount)
  })
  test.afterEach(async ({ testAccount, hostAccount }) => {
    await cleanupSocial(testAccount)
    await cleanupSocial(hostAccount)
  })

  test.describe('runs against Supabase', () => {
    requireSupabase(test, ['writes', 'host'])

    test('shows the host and window end time after joining a quest', async ({ browser, page, testAccount, hostAccount, baseURL }) => {
      await withJoinedQuest({ browser, page, testAccount, hostAccount, baseURL }, 'E2E chip quest', async ({ quest, hostName }) => {
        await openMapCard(page)
        // Before the window starts: "Meet <host> at <first stop>, HH:MM".
        await expect(questChip(page)).toContainText(new RegExp(`Meet ${escapeRe(hostName)} at .+, ${HHMM}`))

        await page.clock.fastForward(msUntil(quest.starts_at))
        await expect(questChip(page)).toContainText(new RegExp(`With ${escapeRe(hostName)} until ${HHMM}`))
      })
    })

    test('lets a guest go solo and return to their own plan', async ({ browser, page, testAccount, hostAccount, baseURL }) => {
      await withJoinedQuest({ browser, page, testAccount, hostAccount, baseURL }, 'E2E solo quest', async ({ hostName }) => {
        await openMapCard(page)
        await expect(questChip(page)).toBeVisible()

        await page.getByRole('button', { name: 'Go solo' }).click()
        const dialog = page.getByRole('alertdialog', { name: 'Go solo?' })
        await expect(dialog).toContainText(`You'll leave ${hostName}'s quest and carry on with your own plan.`)
        await dialog.getByRole('button', { name: 'Go solo' }).click()

        // From the code (QuestGoSolo.vue): leaving does not navigate, the guest stays on the map.
        await expect(dialog).toBeHidden()
        await expect(page).toHaveURL(/\/map$/)
        await expect(questChip(page)).toHaveCount(0)
        await page.goto('/mission')
        await expect(page.getByText(`Fixed time with ${hostName}`)).toHaveCount(0)
      })
    })

    test('automatically returns a guest to their own plan when the joined window ends', async ({ browser, page, testAccount, hostAccount, baseURL }) => {
      await withJoinedQuest({ browser, page, testAccount, hostAccount, baseURL }, 'E2E auto-return quest', async ({ quest, hostName }) => {
        await openMapCard(page)
        await expect(questChip(page)).toBeVisible()

        await page.clock.fastForward(msUntil(quest.ends_at))
        const notice = page.getByRole('alertdialog', { name: `Your stops with ${hostName} are done` })
        await expect(notice).toBeVisible({ timeout: 20_000 })
        await expect(notice).toContainText("You'll carry on with your own plan")
        await notice.getByRole('button', { name: 'Got it' }).click()
        await expect(questChip(page)).toHaveCount(0)
      })
    })
  })

  test.describe('plan-resume line', () => {
    // Still gated: QuestCoopChip renders no resume line, although store.resumeLeg exists.
    gatedDraft(test, 'Missing feature: plan-resume line in the map quest chip')
    requireSupabase(test, ['writes', 'host'])

    test('shows where the guest plan resumes under the chip', async ({ browser, page, testAccount, hostAccount, baseURL }) => {
      await withJoinedQuest({ browser, page, testAccount, hostAccount, baseURL }, 'E2E resume quest', async ({ quest, hostName }) => {
        await openMapCard(page)
        await page.clock.fastForward(msUntil(quest.starts_at))
        await expect(questChip(page)).toContainText(new RegExp(`With ${escapeRe(hostName)} until ${HHMM}`))
        await expect(page.getByText(/Your plan resumes:/)).toBeVisible()
      })
    })
  })
})
