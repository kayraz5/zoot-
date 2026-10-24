import { test as base, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const fixture = (path) => JSON.parse(readFileSync(new URL(`./${path}`, import.meta.url), 'utf8'))
const APP_HOSTS = new Set(['localhost', '127.0.0.1'])
const EXTERNAL_FIXTURES = [
  [/api\.open-meteo\.com\/.+\/forecast/, 'external/open-meteo.json'],
  [/api-open\.data\.gov\.sg\/.*psi/, 'external/psi.json'],
  [/api-open\.data\.gov\.sg\/.*lightning/, 'external/lightning.json']
]

/**
 * Install the deterministic browser environment shared by smoke and draft specs.
 * auth is one of signed-out, needs-onboarding, or onboarded.
 */
export async function installHarness(page, { auth = 'signed-out', profile = {} } = {}) {
  await page.addInitScript(({ auth, profile }) => {
    localStorage.setItem('zoot.guest', '1')
    if (auth === 'signed-out') return

    const id = 'guest-e2e'
    localStorage.setItem('zoot.profile', JSON.stringify({
      id,
      display_name: 'E2E Traveller',
      style: auth === 'onboarded' ? 'budget' : null,
      xp: 0,
      home_city: null,
      is_verified: false,
      avatar_seed: 1,
      cover_color: '#ffcc00',
      created_at: '2030-01-01T00:00:00Z',
      ...profile
    }))
    localStorage.setItem('zoot.session', JSON.stringify({
      user: { id, email: null },
      guest: true
    }))
  }, { auth, profile })

  await page.route((url) => !APP_HOSTS.has(url.hostname), (route) => {
    const hit = EXTERNAL_FIXTURES.find(([pattern]) => pattern.test(route.request().url()))
    return hit
      ? route.fulfill({ json: fixture(hit[1]) })
      : route.abort()
  })

  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url())

    if (pathname === '/api/plan') {
      let body = {}
      try {
        body = route.request().postDataJSON() || {}
      } catch {
        body = {}
      }

      const catalog = Array.isArray(body.catalog) ? body.catalog : []
      return route.fulfill({
        json: {
          model: 'e2e-fixture',
          choice: {
            schema: 'zoot.choice.v1',
            title: 'E2E Quest',
            picks: catalog.slice(0, 3).map((place) => ({
              place_id: place.id,
              why: 'Picked by the E2E fixture.'
            }))
          }
        }
      })
    }

    const name = pathname.replace('/api/', '')
    try {
      return route.fulfill({ json: fixture(`api/${name}.json`) })
    } catch {
      return route.fulfill({
        status: 404,
        json: { error: `no fixture for ${pathname}` }
      })
    }
  })
}

export const test = base.extend({
  auth: ['signed-out', { option: true }],
  page: async ({ page, auth }, use) => {
    await installHarness(page, { auth })
    await use(page)
  }
})

export { expect }
