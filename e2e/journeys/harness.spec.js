/**
 * Harness self-test (Requirement 3.5): in the guest harness, no request leaves localhost except
 * external calls the harness fulfils from e2e/fixtures/external. Everything else is aborted
 * before it reaches the network, including the Supabase host when the dev server has keys
 * configured (the app then tries its catalog read, and the harness must abort it).
 *
 * How it checks: an observer route registered after installHarness() runs first for every
 * non-localhost request, records it and falls back to the harness handler. Page events record the
 * outcome. The assertions compare counts only, so no URL or env value appears in the output.
 *
 * Bypass rule: a request that never reached the routing counts as a bypass only if it received
 * a response or never settled. A request the browser itself aborted or failed with no response
 * (for example Firefox cancelling an in-flight fetch with NS_BINDING_ABORTED during page.goto)
 * never left the browser's network stack with an answer, so it is not a leak. Such requests are
 * counted separately as "aborted by the browser before routing" and do not fail the test.
 */
import { APP_HOSTS, EXTERNAL_FIXTURES, expect, test } from '../fixtures/harness.js'

const FIXED_NOW = new Date('2030-01-15T09:00:00+08:00')

const isHttp = (url) => /^https?:/.test(url)
const isExternal = (url) => isHttp(url) && !APP_HOSTS.has(new URL(url).hostname)
const isFixture = (url) => EXTERNAL_FIXTURES.some(([pattern]) => pattern.test(url))
const isSupabase = (url) => /\.supabase\.(co|in)$/.test(new URL(url).hostname)

test.describe('guest harness network boundary', () => {
  test.use({ auth: 'onboarded' })

  test('keeps every request on localhost except fulfilled fixtures', async ({ page }) => {
    test.slow() // a three-page journey: plan, map, quests
    const external = []          // Request objects for every non-localhost http(s) request
    const intercepted = new Set() // Requests the harness routing saw
    const finished = new Set()
    const failed = new Set()
    let externalSockets = 0

    // Registered after installHarness(), so it runs first; fallback() hands over to the harness.
    await page.route((url) => isExternal(url.href), (route) => {
      intercepted.add(route.request())
      return route.fallback()
    })
    page.on('request', (request) => { if (isExternal(request.url())) external.push(request) })
    page.on('requestfinished', (request) => { if (isExternal(request.url())) finished.add(request) })
    page.on('requestfailed', (request) => { if (isExternal(request.url())) failed.add(request) })
    page.on('websocket', (socket) => { if (isExternal(socket.url())) externalSockets += 1 })

    // A journey that touches weather, the catalog, the plan API, map tiles and the quests pages.
    await page.clock.install({ time: FIXED_NOW })
    await page.goto('/plan')
    await page.getByLabel('Lands at Changi').fill('2030-01-15T09:30')
    await page.getByLabel('Next flight leaves').fill('2030-01-15T17:30')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Build my quest' }).click()
    // Headless Firefox can take longer to build the plan; same wait as e2e/fixtures/social.js.
    await expect(page).toHaveURL(/\/mission\/[^/]+$/, { timeout: 30_000 })
    // The map page keeps WebGL and aborted tile requests busy; under parallel load Firefox can
    // be late with the `load` event, so these navigations wait for DOMContentLoaded and the
    // assertions below do the real waiting.
    await page.goto('/map', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('timer')).toBeVisible()
    await page.goto('/quests', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Sign in to quest with others' })).toBeVisible()

    // Wait until every external request has settled (fulfilled or aborted).
    const unsettled = () => external.filter((r) => !finished.has(r) && !failed.has(r)).length
    await expect.poll(unsettled, { message: 'external requests still in flight' }).toBe(0)

    const notRouted = external.filter((r) => !intercepted.has(r))
    // Split unrouted requests: browser-aborted with no response is settled, not a bypass.
    const notRoutedResponses = await Promise.all(notRouted.map((r) => r.response().catch(() => null)))
    const isBrowserAborted = (r, i) => failed.has(r) && !finished.has(r) && notRoutedResponses[i] === null
    const bypassedRequests = notRouted.filter((r, i) => !isBrowserAborted(r, i))
    const abortedBeforeRouting = notRouted.length - bypassedRequests.length
    const bypassed = bypassedRequests.length
    const finishedNonFixture = [...finished].filter((r) => !isFixture(r.url())).length
    const supabaseAnswered = [...finished].filter((r) => isSupabase(r.url())).length

    expect(external.length, 'the journey made no external request, so the check is vacuous').toBeGreaterThan(0)
    // URL-free summary of any bypass: resource type and outcome only.
    const bypassSummary = bypassedRequests
      .map((r) => `${r.resourceType()}:${finished.has(r) ? 'answered' : r.failure()?.errorText ?? 'pending'}`)
      .join(', ')
    // Count only, never URLs: recorded so a browser abort stays visible without failing the test.
    test.info().annotations.push({
      type: 'aborted by the browser before routing',
      description: String(abortedBeforeRouting),
    })
    expect(bypassed, `external requests that bypassed the harness routing (${bypassSummary})`).toBe(0)
    expect(finishedNonFixture, 'external requests answered by something other than a fixture').toBe(0)
    expect(supabaseAnswered, 'Supabase requests that received a response').toBe(0)
    expect(externalSockets, 'websockets opened to a non-localhost host').toBe(0)
  })
})
