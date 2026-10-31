/**
 * UI steps shared by the Supabase-gated social journeys (e2e/social/*.supabase.spec.js).
 * They drive the real app against the configured project: plan a layover (with the /api/plan
 * stub), open stops to company as a host, join as a guest. No env value is read or printed here.
 */
import { expect, installSupabaseHarness, latestHostedQuest } from './supabase.js'

/** The app is Singapore-only; pages run in Singapore time so datetime-local inputs line up. */
export const TIMEZONE = 'Asia/Singapore'
const SG_OFFSET_MS = 8 * 60 * 60000

/** 'YYYY-MM-DDTHH:MM' in Singapore time, for datetime-local inputs. */
export function sgLocal(ms) {
  return new Date(ms + SG_OFFSET_MS).toISOString().slice(0, 16)
}

/** Social journeys plan a real layover and wait on the network: give them room. */
export const SOCIAL_TIMEOUT_MS = 180_000

/**
 * A second signed-in page in its own browser context (two-account scenarios).
 * The caller closes `context` in a `finally`.
 */
export async function openAccountPage(browser, account, baseURL) {
  const context = await browser.newContext({ baseURL, timezoneId: TIMEZONE })
  const page = await context.newPage()
  await installSupabaseHarness(page, account)
  return { context, page }
}

/**
 * Plan a layover through the UI, landing a few minutes from now so every stop is in the future
 * (hosts can only open stops that start 15+ min from now). Both accounts in a two-account test
 * call this with the same `landMs`, so their plans line up and a join displaces the guest's stops.
 * Returns the mission URL.
 */
export async function planLayover(page, { landMs, flightMs }) {
  await page.goto('/plan')
  await page.getByLabel('Lands at Changi').fill(sgLocal(landMs))
  await page.getByLabel('Next flight leaves').fill(sgLocal(flightMs))
  await page.getByRole('button', { name: 'Continue' }).click() // confirms the layover dialog
  await page.getByRole('button', { name: 'Build my quest' }).click()
  await expect(page).toHaveURL(/\/mission\/[^/]+$/, { timeout: 30_000 })
  return page.url()
}

/** Default layover for social journeys: land in 10 min, fly out in 9 h. */
export function layoverTimes(nowMs = Date.now()) {
  const landMs = Math.ceil((nowMs + 10 * 60000) / 60000) * 60000
  return { landMs, flightMs: landMs + 9 * 60 * 60000 }
}

/**
 * As the host, on the mission page: open every openable stop to company through
 * OpenToCompanySheet, then read the new quest from the database.
 */
export async function openToCompany(page, hostAccount, title) {
  await page.getByRole('button', { name: 'Open to company', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Open to company' })
  await expect(sheet).toBeVisible()
  // The "Name your quest" label points at id="otc-title", which the sheet's heading also uses, so
  // the label does not reach the input. The title input is the sheet's first text box.
  await sheet.getByRole('textbox').first().fill(title)
  await sheet.getByRole('button', { name: /^Open (this stop|these \d+ stops)$/ }).click()
  await expect(sheet.getByRole('link', { name: 'View as guests see it' })).toBeVisible({ timeout: 20_000 })
  await sheet.getByRole('button', { name: 'Close' }).click()
  return latestHostedQuest(hostAccount)
}

/**
 * As the guest: open the quest page, pick every stop that fits, check the confirm sheet and join.
 * Returns the names of the guest's own stops the join removed (read from the sheet).
 */
export async function joinQuest(page, questId, hostName) {
  await page.goto(`/quests/${questId}`)
  await page.getByRole('button', { name: /^Join (this stop|these \d+ stops)$/ }).click()

  const sheet = page.getByRole('dialog', { name: `Join ${hostName}?` })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Added')
  await expect(sheet).toContainText('Removed from your plan')
  const removed = (await sheet.locator('.row-del s').allTextContents()).map((name) => name.trim()).filter(Boolean)
  expect(removed.length, 'the join removed none of the guest stops').toBeGreaterThan(0)

  await sheet.getByRole('button', { name: 'Join & update my plan' }).click()
  await expect(sheet).toBeHidden({ timeout: 20_000 })
  return removed
}

/**
 * Host plans and opens a window; guest plans the same layover and joins all of it.
 * Returns the guest's `removed` stop names and the quest row.
 */
export async function hostAndJoin({ hostPage, guestPage, hostAccount, hostName, title }) {
  const times = layoverTimes()
  await planLayover(hostPage, times)
  const quest = await openToCompany(hostPage, hostAccount, title)
  await planLayover(guestPage, times)
  const removed = await joinQuest(guestPage, quest.id, hostName)
  return { quest, removed }
}

/** On /map: open the next-stop card (it remembers being closed) so the quest chip and links show. */
export async function openMapCard(page) {
  await page.goto('/map', { waitUntil: 'domcontentloaded' })
  const show = page.getByRole('button', { name: 'Show next-stop card' })
  const hide = page.getByRole('button', { name: 'Hide next-stop card' })
  await expect(show.or(hide)).toBeVisible({ timeout: 20_000 })
  if (await show.isVisible()) await show.click()
  await expect(hide).toBeVisible()
}

/** The map quest chip: QuestCoopChip has role=button and aria-label "Open my plan". */
export const questChip = (page) => page.getByRole('button', { name: 'Open my plan' })

/** Escape a display name for use inside a RegExp. */
export const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Milliseconds to move the browser clock so it is `extraMs` past `iso`. */
export const msUntil = (iso, extraMs = 60_000) => Math.max(0, Date.parse(iso) - Date.now() + extraMs)
