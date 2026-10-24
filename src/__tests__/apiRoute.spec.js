// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import handler from '../../api/route.js'
import {
  jsonResponse,
  mockReq,
  mockRes,
  stubFetch,
  textResponse,
  useCleanSlate,
} from './helpers/index.js'

useCleanSlate()

const request = (overrides = {}) => mockReq({
  method: 'POST',
  url: '/api/route',
  body: {
    start: [103.8519, 1.3644],
    end: [103.852, 1.3],
    profile: 'walk',
  },
  ...overrides,
})

function clearRouteConfig() {
  vi.stubEnv('ORS_API_KEY', '')
  vi.stubEnv('SUPABASE_URL', '')
  vi.stubEnv('SUPABASE_SECRET_KEY', '')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  vi.stubEnv('VITE_SUPABASE_URL', '')
}

function configureOrs() {
  clearRouteConfig()
  vi.stubEnv('ORS_API_KEY', 'ors-test-key')
}

describe('POST /api/route', () => {
  it.each(['GET', 'PUT', 'DELETE'])('returns 405 for %s requests', async (method) => {
    const res = mockRes()

    await handler(request({ method }), res)

    expect(res.statusCode).toBe(405)
    expect(res.body).toEqual({ error: 'POST only' })
  })

  it.each([
    ['a missing start', { start: undefined }],
    ['an invalid end', { end: 'not-coordinates' }],
    ['an unsupported profile', { profile: 'bike' }],
  ])('returns 400 for %s', async (_description, body) => {
    const res = mockRes()

    await handler(request({ body: { ...request().body, ...body } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toContain('start, end')
  })

  it('returns 503 when neither Supabase nor ORS is configured', async () => {
    clearRouteConfig()
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'ORS_API_KEY is not set' })
  })

  it('returns 429 when ORS rate-limits the request', async () => {
    configureOrs()
    stubFetch([
      ['openrouteservice.org', () => textResponse('too many requests', 429)],
    ])
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual({ error: 'ORS 429' })
  })

  it('returns 502 when ORS responds with a server error', async () => {
    configureOrs()
    stubFetch([
      ['openrouteservice.org', () => textResponse('upstream failure', 500)],
    ])
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'ORS 500' })
  })

  it('returns 502 when ORS returns no route features', async () => {
    configureOrs()
    stubFetch([
      ['openrouteservice.org', () => jsonResponse({ features: [] })],
    ])
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'ORS returned no route' })
  })

  it('returns route coordinates and distance for a successful ORS response', async () => {
    configureOrs()
    const fetchMock = stubFetch([
      ['openrouteservice.org', () => jsonResponse({
        features: [{
          geometry: { coordinates: [[103.8519, 1.3644], [103.852, 1.3]] },
          properties: { segments: [{ distance: 7142.5 }] },
        }],
      })],
    ])
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      coords: [[103.8519, 1.3644], [103.852, 1.3]],
      distance_m: 7142.5,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns cached geometry without fetching ORS', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'supabase-test-key')
    vi.stubEnv('ORS_API_KEY', '')
    const cached = {
      coords: [[103.8519, 1.3644], [103.852, 1.3]],
      distance_m: 7000,
    }
    const fetchMock = stubFetch([
      ['supabase.test', () => jsonResponse([{ geometry: cached }])],
    ])
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(cached)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('openrouteservice.org'))).toBe(true)
  })

  it('falls through to ORS when reading the Supabase cache fails', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test')
    vi.stubEnv('SUPABASE_SECRET_KEY', 'supabase-test-key')
    vi.stubEnv('ORS_API_KEY', 'ors-test-key')
    const route = {
      coords: [[103.8519, 1.3644], [103.852, 1.3]],
      distance_m: 7142.5,
    }
    const fetchMock = stubFetch([
      ['supabase.test', (_url, init) => (
        init?.method === 'POST'
          ? jsonResponse(null, 204)
          : textResponse('cache unavailable', 500)
      )],
      ['openrouteservice.org', () => jsonResponse({
        features: [{
          geometry: { coordinates: route.coords },
          properties: { segments: [{ distance: route.distance_m }] },
        }],
      })],
    ])
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mockRes()

    await handler(request(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(route)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('openrouteservice.org'))).toBe(true)
    expect(warning).toHaveBeenCalledWith(
      '[api/route] cache read failed',
      expect.objectContaining({ message: 'Supabase 500: cache unavailable' }),
    )
  })
})
