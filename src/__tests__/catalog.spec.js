import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalog, placeById } from '../model/services/catalog.js'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

afterEach(() => {
  vi.doUnmock('../model/services/db/index.js')
  vi.resetModules()
})

async function importFreshCatalog({ rows = [], error } = {}) {
  vi.resetModules()

  const listPlaces = vi.fn(async () => {
    if (error) throw error
    return rows
  })

  vi.doMock('../model/services/db/index.js', () => ({
    getDb: vi.fn(async () => ({ listPlaces })),
  }))

  const freshCatalog = await import('../model/services/catalog.js')
  return { ...freshCatalog, listPlaces }
}

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

  it('keeps the bundled catalog when the database has no rows in guest mode', async () => {
    const bundledIds = catalog.value.map((place) => place.id)
    const fresh = await importFreshCatalog({ rows: [] })

    await expect(fresh.loadCatalog()).resolves.toEqual(fresh.catalog.value)
    expect(fresh.catalog.value.map((place) => place.id)).toEqual(bundledIds)
    expect(fresh.listPlaces).toHaveBeenCalledTimes(1)
  })

  it('replaces the bundled catalog with database rows when rows are available', async () => {
    const rows = [{
      id: 'db-place',
      name: 'Database Place',
      lat: 1.3008,
      lng: 103.8559,
      tags: ['food'],
      mrt: 'Bugis',
      active: true,
    }]
    const fresh = await importFreshCatalog({ rows })

    await fresh.loadCatalog()

    expect(fresh.catalog.value).toEqual(rows)
    expect(fresh.placeById.value.get('db-place')).toEqual(rows[0])
  })

  it('warns and keeps the bundled catalog when the database rejects', async () => {
    const bundledIds = catalog.value.map((place) => place.id)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fresh = await importFreshCatalog({ error: new Error('database unavailable') })

    await fresh.loadCatalog()

    expect(fresh.catalog.value.map((place) => place.id)).toEqual(bundledIds)
    expect(warning).toHaveBeenCalledWith('[catalog] using bundled places:', 'database unavailable')
  })

  it('skips the database on the second load after the catalog has been loaded', async () => {
    const fresh = await importFreshCatalog({ rows: [{
      id: 'db-place',
      name: 'Database Place',
      lat: 1.3008,
      lng: 103.8559,
      tags: [],
      mrt: 'Bugis',
      active: true,
    }] })

    await fresh.loadCatalog()
    await fresh.loadCatalog()

    expect(fresh.listPlaces).toHaveBeenCalledTimes(1)
  })
})
