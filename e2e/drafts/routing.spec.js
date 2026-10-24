/**
 * DRAFT — Feature: route guards and legacy party-to-quest redirects.
 * Status: route behavior is documented for the unfinished journeys in docs/repo-audit.md §1 and §3.
 * Reference: Requirements 11.1–11.5 and 12.1–12.2. Enable with E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/routing.spec.js (PowerShell: $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/routing.spec.js).
 */
import { draft, expect, test } from '../fixtures/draft.js'

draft('redirects a signed-out visitor from the plan to authentication', async ({ page }) => {
  await page.goto('/plan')
  await expect(page).toHaveURL(/\/auth\?next=%2Fplan$/)
})

test.describe('guest route guards', () => {
  test.use({ auth: 'needs-onboarding' })

  draft('redirects a guest without a travel style from the plan to onboarding', async ({ page }) => {
    await page.goto('/plan')
    await expect(page).toHaveURL(/\/onboard\?next=%2Fplan$/)
  })
})

test.describe('onboarded party aliases', () => {
  test.use({ auth: 'onboarded' })

  draft('redirects a party with an id to its quest detail route', async ({ page }) => {
    await page.goto('/party/abc')
    await expect(page).toHaveURL(/\/quests\/abc$/)
  })

  draft('redirects a party without an id to the quests route', async ({ page }) => {
    await page.goto('/party')
    await expect(page).toHaveURL(/\/quests$/)
  })
})

draft('redirects an unknown path to the landing page', async ({ page }) => {
  await page.goto('/not-a-real-zoot-route')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Start a layover' })).toBeVisible()
})
