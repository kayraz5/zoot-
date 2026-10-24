/**
 * DRAFT — Feature: co-op stamp XP and shared stamps.
 * Status: unfinished feature; Supabase REST/realtime is stubbed in this draft.
 * Reference: docs/social-quests-spec.md §During the quest and repo-audit.md §3 (missing co-op XP); Requirements 11.1, 11.2, 11.3, 11.5, 12.4, 12.5, 12.6.
 * Enable: E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/coop-xp.spec.js (PowerShell: $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/coop-xp.spec.js).
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.use({ auth: 'onboarded' })

draft('shows a co-op bonus when another member has stamped the same stop', async ({ page }) => {
  await page.route('**/rest/v1/party_locations**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/stamp_place**', (route) => route.fulfill({
    json: { xp: 60, co_op: true, co_op_bonus_percent: 20, co_op_stamp: true }
  }))
  await page.route('**/realtime/**', (route) => route.fulfill({ status: 200, body: '' }))

  await page.goto('/map')
  await expect(page.getByText('Mei is here')).toBeVisible()
  await page.getByRole('button', { name: /Stamp/ }).click()

  await expect(page.getByText(/Co-op bonus.*20%|20%.*Co-op bonus/)).toBeVisible()
  await expect(page.getByText('Co-op stamp')).toBeVisible()
})
