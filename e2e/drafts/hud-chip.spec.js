/**
 * DRAFT — Feature: map HUD co-op chip ("With <host> until HH:MM", Go solo, auto-return).
 * Status: unfinished feature; Supabase REST/realtime is stubbed and needs a test project or fixture before this can pass.
 * Reference: docs/repo-audit.md §6, docs/social-quests-spec.md "During the quest", Requirements 11.1–11.5 and 12.4–12.6.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/hud-chip.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/hud-chip.spec.js
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.describe('joined quest map HUD', () => {
  test.use({ auth: 'onboarded' })

  draft('shows the host and window end time after joining a quest', async ({ page }) => {
    await page.goto('/map')

    await expect(page.getByRole('button', { name: /With Mei until \d{2}:\d{2}/ })).toBeVisible()
    await expect(page.getByText(/Your plan resumes:/)).toBeVisible()
  })

  draft('lets a guest go solo and return to their own plan', async ({ page }) => {
    await page.goto('/map')

    await page.getByRole('button', { name: 'Go solo' }).click()

    await expect(page).toHaveURL(/\/plan$/)
    await expect(page.getByRole('heading', { name: /Your layover|Plan a layover/ })).toBeVisible()
  })

  draft('automatically returns a guest to their own plan when the joined window ends', async ({ page }) => {
    await page.clock.install({ time: new Date('2030-01-15T18:29:00+08:00') })
    await page.goto('/map')

    await expect(page.getByRole('button', { name: /With Mei until 18:30/ })).toBeVisible()
    await page.clock.fastForward('1 minute')

    await expect(page).toHaveURL(/\/plan$/)
    await expect(page.getByRole('heading', { name: /Your layover|Plan a layover/ })).toBeVisible()
  })
})
