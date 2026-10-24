/**
 * DRAFT — Feature: live location for joined quest members.
 * Status: unfinished feature; Supabase REST/realtime is stubbed in this draft.
 * Reference: docs/social-quests-spec.md §During the quest and repo-audit.md §3 (missing live location); Requirements 11.1, 11.2, 11.3, 11.5, 12.4, 12.5, 12.6.
 * Enable: E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/live-location.spec.js (PowerShell: $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/live-location.spec.js).
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.use({ auth: 'onboarded' })

draft('shows a joined member marker and removes it after leaving the quest', async ({ page }) => {
  await page.route('**/rest/v1/party_locations**', (route) => route.fulfill({
    json: [{ user_id: 'mei', display_name: 'Mei', lat: 1.283, lng: 103.86, updated_at: '2030-01-15T12:30:00Z' }]
  }))
  await page.route('**/rest/v1/rpc/leave_window', (route) => route.fulfill({ json: { ok: true } }))
  await page.route('**/realtime/**', (route) => route.fulfill({ status: 200, body: '' }))

  await page.goto('/map')
  await expect(page.getByRole('button', { name: 'Mei live location' })).toBeVisible()

  await page.getByRole('button', { name: 'Go solo' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText("You'll leave Mei's quest")
  await dialog.getByRole('button', { name: 'Go solo' }).click()

  await expect(page.getByRole('button', { name: 'Mei live location' })).toHaveCount(0)
})
