import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, stubFetch, useCleanSlate } from './helpers/index.js'

useCleanSlate()

const from = { lat: 1.3001, lng: 103.8001 }
const to = { lat: 1.3102, lng: 103.8102 }

const osrmResponse = ({ distance = 123, coords = [[103.8001, 1.3001], [103.8102, 1.3102]], steps } = {}) => ({
  routes: [{
    geometry: { coordinates: coords },
    distance,
    ...(steps ? { legs: [{ steps }] } : {}),
  }],
})

let routing

beforeEach(async () => {
  vi.resetModules()
  routing = await import('../model/services/routing.js')
})

describe('routing service', () => {
  it('returns an OSRM walking route with described step text', async () => {
    const fetchMock = stubFetch([
      ['routed-foot', () => jsonResponse(osrmResponse({
        steps: [
          {
            maneuver: { type: 'depart', location: [103.8001, 1.3001] },
            name: 'River Valley Road',
            distance: 42,
          },
          {
            maneuver: { type: 'turn', modifier: 'left', location: [103.805, 1.305] },
            name: 'Orchard Road',
            distance: 81,
          },
        ],
      }))],
    ])

    const route = await routing.getWalkRoute(from, to)

    expect(route).toEqual(expect.objectContaining({
      coords: [[103.8001, 1.3001], [103.8102, 1.3102]],
      distance_m: 123,
    }))
    expect(route.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Head off along River Valley Road' }),
      expect.objectContaining({ text: 'Turn left onto Orchard Road' }),
    ]))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('steps=true')
  })

  it('falls back to the walking API route when OSRM fails', async () => {
    const fallback = { coords: [[103.8, 1.3], [103.81, 1.31]], distance_m: 456 }
    const fetchMock = stubFetch([
      ['routed-foot', () => jsonResponse({}, 500)],
      ['/api/route', (url, init) => jsonResponse(fallback)],
    ])

    const route = await routing.getWalkRoute(from, to)

    expect(route).toEqual(fallback)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/route')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      start: [from.lng, from.lat],
      end: [to.lng, to.lat],
      profile: 'walk',
    })
  })

  it('returns null after all walking providers fail and retries the next request', async () => {
    const fetchMock = stubFetch([
      ['routed-foot', () => jsonResponse({}, 500)],
      ['/api/route', () => jsonResponse({}, 500)],
    ])

    await expect(routing.getWalkRoute(from, to)).resolves.toBeNull()
    await expect(routing.getWalkRoute(from, to)).resolves.toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('routed-foot'),
      '/api/route',
      expect.stringContaining('routed-foot'),
      '/api/route',
    ])
  })

  it('reuses a successful route for the same coordinate pair', async () => {
    const fetchMock = stubFetch([
      ['routed-foot', () => jsonResponse(osrmResponse({ distance: 88 }))],
    ])

    const first = routing.getWalkRoute(from, to)
    const second = routing.getWalkRoute(from, to)
    const [firstRoute, secondRoute] = await Promise.all([first, second])

    expect(firstRoute).toEqual(secondRoute)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tries drive providers in order before using the proxy', async () => {
    const fetchMock = stubFetch([
      ['routing.openstreetmap.de/routed-car', () => jsonResponse({}, 500)],
      ['router.project-osrm.org', () => jsonResponse({}, 500)],
      ['/api/route', () => jsonResponse({ coords: [[103.8, 1.3], [103.81, 1.31]], distance_m: 999 })],
    ])

    const route = await routing.getDriveRoute(from, to)

    expect(route.distance_m).toBe(999)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('routing.openstreetmap.de/routed-car'),
      expect.stringContaining('router.project-osrm.org'),
      '/api/route',
    ])
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).profile).toBe('taxi')
  })

  it('aborts a timed-out walking provider and advances to the next provider', async () => {
    vi.useFakeTimers()
    let aborted = false
    const fetchMock = stubFetch([
      ['routed-foot', (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })],
      ['/api/route', () => jsonResponse({
        coords: [[103.8, 1.3], [103.81, 1.31]],
        distance_m: 321,
      })],
    ])

    const request = routing.getWalkRoute(from, to)
    await vi.advanceTimersByTimeAsync(6000)
    const route = await request

    expect(route.distance_m).toBe(321)
    expect(aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/route')
  })
})
