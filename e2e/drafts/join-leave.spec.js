/**
 * DRAFT — Feature: server-backed join and leave with fixed itinerary blocks.
 * Status: unfinished feature; Supabase REST/realtime is stubbed in this draft.
 * Reference: docs/social-quests-spec.md §Guest and §How joining changes the guest's itinerary and repo-audit.md §3 (missing join/leave); Requirements 11.1, 11.2, 11.3, 11.5, 12.4, 12.5, 12.6.
 * Enable: E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/join-leave.spec.js (PowerShell: $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/join-leave.spec.js).
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.use({ auth: 'onboarded' })

async function stubSocialApi(page, handlers = {}) {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/join_window', async (route) => {
    handlers.join?.(route.request())
    await route.fulfill({ json: { ok: true, fixed: true } })
  })
  await page.route('**/rest/v1/rpc/leave_window', async (route) => {
    handlers.leave?.(route.request())
    await route.fulfill({ json: { ok: true, restored: ['Superpark'] } })
  })
  await page.route('**/realtime/**', (route) => route.fulfill({ status: 200, body: '' }))
}

draft('sends the join request and shows the joined stops as fixed blocks', async ({ page }) => {
  let joinCalled = false
  await stubSocialApi(page, { join: () => { joinCalled = true } })

  await page.goto('/quests/coop-q1')
  await page.getByRole('button', { name: /Join stop|Join stops/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Added')
  await expect(dialog).toContainText('Removed from your plan')
  await dialog.getByRole('button', { name: 'Join & update my plan' }).click()

  expect(joinCalled).toBe(true)
  await expect(page.getByText('Fixed time with Mei')).toBeVisible()
})

draft('leaving the quest restores stops removed by the join', async ({ page }) => {
  let leaveCalled = false
  await stubSocialApi(page, { leave: () => { leaveCalled = true } })

  await page.goto('/quests/coop-q1')
  await page.getByRole('button', { name: 'Go solo' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Go solo' }).click()

  expect(leaveCalled).toBe(true)
  await expect(page.getByText('You are back on your own plan')).toBeVisible()
  await page.goto('/mission')
  await expect(page.getByText('Superpark')).toBeVisible()
  await expect(page.getByText('Fixed time with Mei')).toHaveCount(0)
})
