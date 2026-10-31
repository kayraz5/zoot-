import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalog, placeById } from '../model/services/catalog.js'
import { jsonResponse, stubFetch, useCleanSlate } from './helpers/index.js'

useCleanSlate()

afterEach(() => {
  vi.resetModules()
})

const TEST_URL = 'https://example.supabase.co'
const TEST_KEY = 'test-anon-key'
const PLACES_URL = `${TEST_URL}/rest/v1/places?select=*&order=name`

/** Import a fresh catalog module with Supabase configured or not (same pattern as config.spec.js). */
async function importFreshCatalog({ configured }) {
  vi.stubEnv('VITE_SUPABASE_URL', configured ? TEST_URL : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? TEST_KEY : '')
  vi.resetModules()
  return import('../model/services/catalog.js')
}

const dbRow = (tags = ['food']) => ({
  id: 'db-place',
  name: 'Database Place',
  lat: 1.3008,
  lng: 103.8559,
  tags,
  mrt: 'Bugis',
  active: true,
})

describe('catalog service', () => {
  it('contains active bundled places with tags and MRT information', () => {
    expect(catalog.value.length).toBeGreaterThan(0)
    expect(catalog.value.every((place) => place.active !== false)).toBe(true)
    expect(catalog.value.every((place) => Array.isArray(place.tags))).toBe(true)
    expect(catalog.value.every((place) => typeof place.mrt === 'string' && place.mrt.length > 0)).toBe(true)
  })

  it('keeps inactive bundled places available through placeById', () => {
    const inactive = [...placeById.value.values()].find((place) => place.active === false)

    expect(inactive).toBeDefined()
    expect(catalog.value.some((place) => place.id === inactive.id)).toBe(false)
    expect(placeById.value.get(inactive.id)).toEqual(inactive)
  })

  it('keeps the bundled catalog and makes no request when Supabase is not configured', async () => {
    const bundledIds = catalog.value.map((place) => place.id)
    const fresh = await importFreshCatalog({ configured: false })
    const fetchMock = stubFetch([])

    await expect(fresh.loadCatalog()).resolves.toEqual(fresh.catalog.value)
    expect(fresh.catalog.value.map((place) => place.id)).toEqual(bundledIds)
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  it('keeps the bundled catalog when the table has no rows', async () => {
    const bundledIds = catalog.value.map((place) => place.id)
    const fresh = await importFreshCatalog({ configured: true })
    const fetchMock = stubFetch([['/rest/v1/places', () => jsonResponse([])]])

    await expect(fresh.loadCatalog()).resolves.toEqual(fresh.catalog.value)
    expect(fresh.catalog.value.map((place) => place.id)).toEqual(bundledIds)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('replaces the bundled catalog with database rows when rows are available', async () => {
    const rows = [dbRow()]
    const fresh = await importFreshCatalog({ configured: true })
    const fetchMock = stubFetch([['/rest/v1/places', () => jsonResponse(rows)]])

    await fresh.loadCatalog()

    expect(fresh.catalog.value).toEqual(rows)
    expect(fresh.placeById.value.get('db-place')).toEqual(rows[0])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(PLACES_URL)
    expect(init.headers.apikey).toBe(TEST_KEY)
  })

  it('warns and keeps the bundled catalog when the request rejects', async () => {
    const bundledIds = catalog.value.map((place) => place.id)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fresh = await importFreshCatalog({ configured: true })
    const fetchMock = stubFetch([['/rest/v1/places', () => { throw new Error('database unavailable') }]])

    await fresh.loadCatalog()

    expect(fresh.catalog.value.map((place) => place.id)).toEqual(bundledIds)
    expect(warning).toHaveBeenCalledWith('[catalog] using bundled places:', 'database unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('warns and keeps the bundled catalog on a non-OK response', async () => {
    const bundledIds = catalog.value.map((place) => place.id)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fresh = await importFreshCatalog({ configured: true })
    const fetchMock = stubFetch([['/rest/v1/places', () => jsonResponse({}, 503)]])

    await fresh.loadCatalog()

    expect(fresh.catalog.value.map((place) => place.id)).toEqual(bundledIds)
    expect(warning).toHaveBeenCalledWith('[catalog] using bundled places:', 'places 503')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips the request on the second load after the catalog has been loaded', async () => {
    const fresh = await importFreshCatalog({ configured: true })
    const fetchMock = stubFetch([['/rest/v1/places', () => jsonResponse([dbRow([])])]])

    await fresh.loadCatalog()
    await fresh.loadCatalog()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
