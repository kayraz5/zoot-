// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergePlaces } from '../../api/_lib/places/merge.js'
import {
  addWikipediaBlurbs,
  fetchOsmPlaces,
  parseOsmHours,
} from '../../api/_lib/places/osm.js'
import { placesDbFromEnv, savePlaces } from '../../api/_lib/places/supabase.js'
import { supabaseRest } from '../../api/_lib/supabase.js'
import {
  jsonResponse,
  stubFetch,
  textResponse,
  useCleanSlate,
} from './helpers/index.js'

useCleanSlate()

const seedPlace = (overrides = {}) => ({
  id: 'seed-place',
  name: 'Seed Place',
  area: 'Changi',
  lat: 1.3563,
  lng: 103.9866,
  tags: ['heritage'],
  ...overrides,
})

const osmPlace = (overrides = {}) => ({
  ref: 'osm:node/1',
  name: 'New Museum',
  lat: 1.36,
  lng: 103.99,
  kind: 'museum',
  hoursText: '',
  ...overrides,
})

describe('places merge helper', () => {
  it('preserves seed records and marks them as seed places', () => {
    const seed = seedPlace({ tags: ['landmark'], hours: '24h' })
    const [place] = mergePlaces({ seed: [seed], osm: [] })

    expect(place).toEqual({ ...seed, source: 'seed', active: true })
  })

  it.each([
    ['a place within 40 metres', seedPlace(), osmPlace({ lat: 1.35631, lng: 103.98661 })],
    ['the same name within 3 kilometres', seedPlace({ name: 'Exact Place' }), osmPlace({ name: 'Exact Place', lat: 1.3563, lng: 103.996 })],
    ['a similar name within 700 metres', seedPlace({ name: 'Garden Museum' }), osmPlace({ name: 'Garden Gallery', lat: 1.359, lng: 103.9866 })],
  ])('drops %s instead of adding a duplicate', (_description, seed, item) => {
    const places = mergePlaces({ seed: [seed], osm: [item] })

    expect(places).toHaveLength(1)
    expect(places[0].source).toBe('seed')
  })

  it('assigns a slug, nearest area, parsed hours and verification to a new OSM place', () => {
    const places = mergePlaces({
      seed: [seedPlace()],
      osm: [osmPlace({
        name: 'National Art House',
        ref: 'osm:way/22',
        lat: 1.37,
        lng: 103.99,
        hoursText: 'Mo-Su 10:00-18:00',
      })],
    })

    expect(places[1]).toMatchObject({
      id: 'national-art-house',
      name: 'National Art House',
      area: 'Changi',
      hours: [['10:00', '18:00']],
      closed_days: [],
      hours_verified: true,
      source: 'osm',
    })
  })

  it('uses the area suffix and then a numeric suffix when generated IDs collide', () => {
    const places = mergePlaces({
      seed: [seedPlace({ id: 'new-place' })],
      osm: [
        osmPlace({ name: 'New Place', ref: 'osm:node/30', lat: 1.37, lng: 103.996 }),
        osmPlace({ name: 'New Place!', ref: 'osm:node/31', lat: 1.38, lng: 104.006 }),
      ],
    })

    expect(places.slice(1).map((place) => place.id)).toEqual([
      'new-place-changi',
      'new-place-changi-2',
    ])
  })

  it('keeps a previous OSM place as inactive when it is missing from the new response', () => {
    const previous = [{
      id: 'old-place',
      name: 'Old Place',
      area: 'Changi',
      lat: 1.36,
      lng: 103.99,
      source: 'osm',
      source_ref: 'osm:node/old',
      active: true,
    }]

    const places = mergePlaces({ seed: [seedPlace()], osm: [], previous })

    expect(places).toContainEqual({ ...previous[0], active: false })
  })

  it('preserves a previous source reference ID across syncs', () => {
    const previous = [{
      id: 'stable-place-id',
      name: 'Previous Name',
      area: 'Changi',
      lat: 1.36,
      lng: 103.99,
      source: 'osm',
      source_ref: 'osm:node/42',
      active: true,
    }]
    const places = mergePlaces({
      seed: [seedPlace()],
      previous,
      osm: [osmPlace({ ref: 'osm:node/42', name: 'Updated Name' })],
    })

    expect(places.find((place) => place.source_ref === 'osm:node/42')).toMatchObject({
      id: 'stable-place-id',
      name: 'Updated Name',
    })
  })
})

describe('OSM places helper', () => {
  it.each([
    ['', null],
    ['24/7', { hours: '24h', closed_days: [] }],
    ['Mo-Su 07:00-21:00', { hours: [['07:00', '21:00']], closed_days: [] }],
    ['Tu-Su 09:00-18:00; Mo off', { hours: [['09:00', '18:00']], closed_days: [1] }],
    ['Mo-Fr 09:00-17:00; Sa,Su 10:00-17:00', { hours: [['10:00', '17:00']], closed_days: [] }],
    ['PH off', null],
    ['10:00-24:00', { hours: [['10:00', '23:59']], closed_days: [] }],
  ])('parses opening-hours variant %j', (raw, expected) => {
    expect(parseOsmHours(raw)).toEqual(expected)
  })

  it('maps named node and way elements while filtering unusable elements', async () => {
    const fetchMock = stubFetch([
      ['overpass-api.de', () => jsonResponse({
        elements: [
          { type: 'node', id: 1, lat: 1.3, lon: 103.8, tags: { name: 'Museum Node', tourism: 'museum' } },
          { type: 'way', id: 2, center: { lat: 1.31, lon: 103.81 }, tags: { name: 'Gallery Way', tourism: 'gallery', wikidata: 'Q2' } },
          { type: 'node', id: 3, lat: 1.32, lon: 103.82, tags: { tourism: 'museum' } },
          { type: 'node', id: 4, lat: 1.33, lon: 103.83, tags: { name: 'Bunker', historic: 'fort', website: 'https://example.test' } },
        ],
      })],
    ])

    await expect(fetchOsmPlaces()).resolves.toEqual([
      expect.objectContaining({ ref: 'osm:node/1', name: 'Museum Node', lat: 1.3, lng: 103.8, kind: 'museum' }),
      expect.objectContaining({ ref: 'osm:way/2', name: 'Gallery Way', lat: 1.31, lng: 103.81, kind: 'arts' }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries another Overpass server after the first server fails', async () => {
    const fetchMock = stubFetch([
      ['overpass-api.de', () => textResponse('busy', 503)],
      ['overpass.private.coffee', () => jsonResponse({ elements: [] })],
    ])

    await expect(fetchOsmPlaces()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('private.coffee')
  })

  it('throws the final error when both Overpass servers fail', async () => {
    stubFetch([
      ['overpass-api.de', () => textResponse('first failure', 500)],
      ['overpass.private.coffee', () => textResponse('second failure', 502)],
    ])

    await expect(fetchOsmPlaces()).rejects.toThrow('Overpass 502')
  })

  it('uses cached Wikipedia blurbs without making a Wikipedia request', async () => {
    const item = osmPlace({ ref: 'osm:node/cached', name: 'Cached Place' })
    const fetchMock = vi.fn(() => { throw new Error('Wikipedia should not be fetched') })
    vi.stubGlobal('fetch', fetchMock)

    await expect(addWikipediaBlurbs([item], new Map([[item.ref, 'A cached description.']]))).resolves.toEqual([item])
    expect(item.blurb).toBe('A cached description.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('places sync index helper', () => {
  const fetchOsmPlacesMock = vi.fn()
  const addWikipediaBlurbsMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchOsmPlacesMock.mockReset()
    addWikipediaBlurbsMock.mockReset()
    vi.doMock('../../api/_lib/places/osm.js', async () => {
      const actual = await vi.importActual('../../api/_lib/places/osm.js')
      return { ...actual, fetchOsmPlaces: fetchOsmPlacesMock, addWikipediaBlurbs: addWikipediaBlurbsMock }
    })
  })

  afterEach(() => {
    vi.doUnmock('../../api/_lib/places/osm.js')
  })

  it('syncs OSM places and reports source counts on success', async () => {
    const osm = [osmPlace({ ref: 'osm:node/sync', name: 'Sync Museum' })]
    fetchOsmPlacesMock.mockResolvedValue(osm)
    addWikipediaBlurbsMock.mockResolvedValue(osm)
    const { syncPlaces } = await import('../../api/_lib/places/index.js')

    const result = await syncPlaces({ seed: [seedPlace()] })

    expect(result.ok).toBe(true)
    expect(result.report).toMatchObject({ osm: 1, total: 2, active: 2, bySource: { seed: 1, osm: 1 } })
    expect(result.places).toHaveLength(2)
    expect(addWikipediaBlurbsMock).toHaveBeenCalledWith(osm, expect.any(Map))
  })

  it('returns no places and logs the OSM failure without writing a result', async () => {
    const log = vi.fn()
    fetchOsmPlacesMock.mockRejectedValue(new Error('Overpass unavailable'))
    const { syncPlaces } = await import('../../api/_lib/places/index.js')

    const result = await syncPlaces({ seed: [seedPlace()], log })

    expect(result).toEqual({
      ok: false,
      report: { osm: null, errors: ['OpenStreetMap: Overpass unavailable'] },
      places: null,
    })
    expect(log).toHaveBeenCalledWith('[sync-places] OpenStreetMap: Overpass unavailable')
    expect(addWikipediaBlurbsMock).not.toHaveBeenCalled()
  })
})

describe('Supabase places helper', () => {
  it('saves rows in chunks of 200 and applies place defaults', async () => {
    const db = { upsert: vi.fn().mockResolvedValue(null) }
    const places = Array.from({ length: 201 }, (_, index) => ({
      id: `place-${index}`,
      name: `Place ${index}`,
      lat: 1.2935,
      lng: 103.8532,
    }))

    await expect(savePlaces(db, places)).resolves.toBe(201)

    expect(db.upsert).toHaveBeenCalledTimes(2)
    expect(db.upsert.mock.calls[0][0]).toBe('places')
    expect(db.upsert.mock.calls[0][1]).toHaveLength(200)
    expect(db.upsert.mock.calls[1][1]).toHaveLength(1)
    expect(db.upsert.mock.calls[0][1][0]).toMatchObject({
      id: 'place-0',
      hours: '24h',
      active: true,
      mrt: expect.any(String),
      closed_days: [],
      captions: [],
      source: 'seed',
      hours_verified: true,
    })
  })

  it('returns null when Supabase environment variables are incomplete', () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')

    expect(placesDbFromEnv()).toBeNull()
  })

  it('throws a useful error when Supabase REST fails', async () => {
    stubFetch([
      ['supabase.test', () => textResponse('database unavailable', 500)],
    ])
    const db = supabaseRest('https://supabase.test', 'sb_secret_test')

    await expect(db.select('places', 'select=*')).rejects.toThrow('Supabase 500: database unavailable')
  })

  it('returns null for a successful Supabase 204 response', async () => {
    stubFetch([
      ['supabase.test', () => textResponse('', 204)],
    ])
    const db = supabaseRest('https://supabase.test', 'sb_secret_test')

    await expect(db.upsert('places', [])).resolves.toBeNull()
  })

  it('sends JWT keys in the Supabase Authorization header', async () => {
    const fetchMock = stubFetch([
      ['supabase.test', () => jsonResponse([])],
    ])
    const db = supabaseRest('https://supabase.test', 'eyJservice-role-key')

    await expect(db.select('places', 'select=id')).resolves.toEqual([])

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      apikey: 'eyJservice-role-key',
      Authorization: 'Bearer eyJservice-role-key',
    })
  })
})
