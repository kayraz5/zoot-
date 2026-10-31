import { test, expect } from './fixtures/harness.js'

test('shows the landing page entry points', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('img', { name: 'Zoot' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start a layover' })).toBeVisible()
})
