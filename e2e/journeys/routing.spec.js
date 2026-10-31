/**
 * Journey — Feature: route guards and legacy party-to-quest redirects.
 * Runs in the guest harness (zoot.guest='1', external hosts aborted); see e2e/fixtures/harness.js.
 * Reference: docs/repo-audit.md §1 and §3.
 */
import { expect, test } from '../fixtures/harness.js'

test('redirects a signed-out visitor from the plan to authentication', async ({ page }) => {
  await page.goto('/plan')
  await expect(page).toHaveURL(/\/auth\?next=\/plan$/)
})

test.describe('guest route guards', () => {
  test.use({ auth: 'needs-onboarding' })

  test('redirects a guest without a travel style from the plan to onboarding', async ({ page }) => {
    await page.goto('/plan')
    await expect(page).toHaveURL(/\/onboard\?next=\/plan$/)
  })
})

test.describe('onboarded party aliases', () => {
  test.use({ auth: 'onboarded' })

  test('redirects a party with an id to its quest detail route', async ({ page }) => {
    await page.goto('/party/abc')
    await expect(page).toHaveURL(/\/quests\/abc$/)
  })

  test('redirects a party without an id to the quests route', async ({ page }) => {
    await page.goto('/party')
    await expect(page).toHaveURL(/\/quests$/)
  })
})

test('redirects an unknown path to the landing page', async ({ page }) => {
  await page.goto('/not-a-real-zoot-route')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Start a layover' })).toBeVisible()
})
