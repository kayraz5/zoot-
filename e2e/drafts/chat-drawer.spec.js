/**
 * DRAFT — Feature: joined-window chat drawer opened from the map HUD chip.
 * Status: unfinished feature; Supabase REST/realtime is stubbed and needs a test project or fixture before this can pass.
 * Reference: docs/repo-audit.md §6, docs/social-quests-spec.md "Messaging", Requirements 11.1–11.5 and 12.4–12.6.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/chat-drawer.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/chat-drawer.spec.js
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.describe('joined quest chat', () => {
  test.use({ auth: 'onboarded' })

  draft('opens the chat drawer from the joined quest HUD chip', async ({ page }) => {
    await page.goto('/map')

    await page.getByRole('button', { name: /With Mei until \d{2}:\d{2}/ }).click()

    await expect(page.getByRole('dialog', { name: /quest chat|chat/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible()
  })

  draft('posts a quick reply message in the joined quest chat', async ({ page }) => {
    await page.goto('/map')
    await page.getByRole('button', { name: /With Mei until \d{2}:\d{2}/ }).click()

    await page.getByRole('button', { name: 'Running 5 min late' }).click()

    await expect(page.getByRole('dialog', { name: /quest chat|chat/i })).toContainText('Running 5 min late')
  })
})
