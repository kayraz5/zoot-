/**
 * DRAFT — Feature: open quests list, quest detail stops, and guest account access notice.
 * Status: social quest browsing is documented for the unfinished journeys in docs/repo-audit.md §1–§4 and Requirements 11.1–11.5, 12.3.
 * Enable (bash): E2E_DRAFTS=1 pnpm run test:e2e e2e/drafts/quests.spec.js
 * Enable (PowerShell): $env:E2E_DRAFTS='1'; pnpm run test:e2e e2e/drafts/quests.spec.js
 */
import { draft, expect, test } from '../fixtures/draft.js'

test.describe('onboarded quest journeys', () => {
  test.use({ auth: 'onboarded' })

  draft('renders the open quests list', async ({ page }) => {
    await page.goto('/quests')

    await expect(page.getByRole('heading', { name: 'Open quests' })).toBeVisible()
    await expect(page.getByText('Join someone for a stop or two.')).toBeVisible()
  })

  draft('opens a quest and shows its open stops', async ({ page }) => {
    await page.goto('/quests/e2e-quest')

    await expect(page.getByRole('heading', { name: /quest/i })).toBeVisible()
    await expect(page.getByText('Open stops')).toBeVisible()
    await expect(page.getByRole('list').getByRole('listitem').first()).toBeVisible()
  })

  draft('explains that guest quests need an email account', async ({ page }) => {
    await page.goto('/quests')

    await expect(page.getByRole('heading', { name: 'Sign in to quest with others' })).toBeVisible()
    await expect(page.getByText(/Guest mode keeps everything on this phone/)).toBeVisible()

    await page.goto('/quests/e2e-quest')
    await expect(page.getByRole('heading', { name: 'Sign in to see open quests' })).toBeVisible()
    await expect(page.getByText(/Guest mode keeps everything on this phone/)).toBeVisible()
  })
})
