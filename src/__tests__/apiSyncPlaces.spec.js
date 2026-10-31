// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReq, mockRes, useCleanSlate } from './helpers/index.js'

const places = vi.hoisted(() => ({
  syncPlaces: vi.fn(),
  placesDbFromEnv: vi.fn(),
  savePlaces: vi.fn(),
}))

vi.mock('../../api/_lib/places/index.js', () => ({
  syncPlaces: places.syncPlaces,
}))

vi.mock('../../api/_lib/places/supabase.js', () => ({
  placesDbFromEnv: places.placesDbFromEnv,
  savePlaces: places.savePlaces,
}))

import handler from '../../api/sync-places.js'

useCleanSlate()

const SECRET = 'cron-test-secret'
const authorization = `Bearer ${SECRET}`

beforeEach(() => {
  places.syncPlaces.mockReset()
  places.placesDbFromEnv.mockReset()
  places.savePlaces.mockReset()
  vi.stubEnv('CRON_SECRET', SECRET)
})

const request = (method = 'GET', headers = {}) => mockReq({
  method,
  url: '/api/sync-places',
  headers,
})

const authorizedRequest = (method = 'GET') => request(method, { authorization })

const SEED_ROW = { id: 'seed-place', source: 'seed' }
const OSM_ROW = { id: 'osm-place', source: 'osm' }
const PREVIOUS = [SEED_ROW, OSM_ROW]

function configuredDb(rows = PREVIOUS) {
  const db = { select: vi.fn() }
  places.placesDbFromEnv.mockReturnValue(db)
  db.select.mockResolvedValue(rows)
  return db
}

describe('/api/sync-places', () => {
  it('returns 503 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'CRON_SECRET is not set' })
    expect(places.placesDbFromEnv).not.toHaveBeenCalled()
  })

  it('returns 401 when the bearer token is incorrect', async () => {
    const res = mockRes()

    await handler(request('GET', { authorization: 'Bearer wrong-secret' }), res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
    expect(places.placesDbFromEnv).not.toHaveBeenCalled()
  })

  it('returns 503 when the places database is unavailable', async () => {
    places.placesDbFromEnv.mockReturnValue(null)
    const res = mockRes()

    await handler(authorizedRequest(), res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'SUPABASE_URL / SUPABASE_SECRET_KEY not set' })
    expect(places.syncPlaces).not.toHaveBeenCalled()
  })

  it('returns 502 with the report and does not save when syncing fails', async () => {
    const db = configuredDb()
    const report = { osm: null, errors: ['OpenStreetMap: unavailable'] }
    places.syncPlaces.mockResolvedValue({ ok: false, report, places: null })
    const res = mockRes()

    await handler(authorizedRequest(), res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'OpenStreetMap failed, nothing written', report })
    expect(places.syncPlaces).toHaveBeenCalledTimes(1)
    expect(places.syncPlaces).toHaveBeenCalledWith({ seed: [SEED_ROW], previous: PREVIOUS })
    expect(places.savePlaces).not.toHaveBeenCalled()
    expect(db.select).toHaveBeenCalledWith('places', 'select=*')
  })

  it('returns 500 and writes nothing when the table has no hand-picked places', async () => {
    const db = configuredDb([OSM_ROW])
    const res = mockRes()

    await handler(authorizedRequest(), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'No hand-picked places in the table, nothing written' })
    expect(db.select).toHaveBeenCalledWith('places', 'select=*')
    expect(places.syncPlaces).not.toHaveBeenCalled()
    expect(places.savePlaces).not.toHaveBeenCalled()
  })

  // The handler has no HTTP method guard, so a valid POST is processed instead of rejected.
  it('processes a POST with a valid bearer token because no method guard exists', async () => {
    const db = configuredDb()
    const report = { osm: 1, errors: [], total: 1 }
    const syncedPlaces = [{ id: 'test-place' }]
    places.syncPlaces.mockResolvedValue({ ok: true, report, places: syncedPlaces })
    const res = mockRes()

    await handler(authorizedRequest('POST'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, report })
    expect(places.syncPlaces).toHaveBeenCalledTimes(1)
    expect(places.savePlaces).toHaveBeenCalledWith(db, syncedPlaces)
  })

  it('returns 200 with the report after saving a successful sync', async () => {
    const db = configuredDb()
    const report = { osm: 2, errors: [], total: 2 }
    const syncedPlaces = [{ id: 'place-one' }, { id: 'place-two' }]
    places.syncPlaces.mockResolvedValue({ ok: true, report, places: syncedPlaces })
    const res = mockRes()

    await handler(authorizedRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, report })
    expect(places.savePlaces).toHaveBeenCalledTimes(1)
    expect(places.savePlaces).toHaveBeenCalledWith(db, syncedPlaces)
  })

  it('returns 500 when selecting previous places fails', async () => {
    const db = configuredDb()
    db.select.mockRejectedValue(new Error('database read failed'))
    const res = mockRes()

    await handler(authorizedRequest(), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'database read failed' })
    expect(places.syncPlaces).not.toHaveBeenCalled()
    expect(places.savePlaces).not.toHaveBeenCalled()
  })
})
