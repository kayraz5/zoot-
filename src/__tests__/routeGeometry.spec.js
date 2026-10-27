import { describe, expect, it } from 'vitest'
import {
  projectOnRoute,
  routeDeviationMeters,
  trimRouteAtPosition,
  trimRouteToPosition
} from '../model/services/routeGeometry.js'

// A straight 2 km route heading east at the equator-ish latitude of Singapore.
const LINE = [
  [103.8, 1.3],
  [103.81, 1.3],
  [103.82, 1.3]
]

describe('projectOnRoute', () => {
  it('finds the nearest segment and the projected point', () => {
    const hit = projectOnRoute(LINE, { lat: 1.3001, lng: 103.805 })
    expect(hit.index).toBe(0)
    expect(hit.point[0]).toBeCloseTo(103.805, 6)
    expect(hit.point[1]).toBeCloseTo(1.3, 6)
    expect(hit.distanceM).toBeGreaterThan(10)
    expect(hit.distanceM).toBeLessThan(12)
  })

  it('clamps to the end of the polyline instead of extrapolating', () => {
    const hit = projectOnRoute(LINE, { lat: 1.3, lng: 103.9 })
    expect(hit.index).toBe(1)
    expect(hit.point).toEqual([103.82, 1.3])
  })

  it('handles a single-point route and empty input', () => {
    expect(projectOnRoute([], { lat: 1, lng: 1 })).toBeNull()
    expect(projectOnRoute([[103.8, 1.3]], { lat: 1.3, lng: 103.8 })).toMatchObject({
      index: 0,
      distanceM: 0
    })
  })
})

describe('trimRouteToPosition', () => {
  it('starts exactly at the traveller and keeps the path ahead', () => {
    const trimmed = trimRouteToPosition(LINE, { lat: 1.3, lng: 103.805 })
    expect(trimmed[0]).toEqual([103.805, 1.3])
    expect(trimmed).toContainEqual([103.81, 1.3])
    expect(trimmed).toContainEqual([103.82, 1.3])
    expect(trimmed.at(-1)).toEqual([103.82, 1.3])
  })

  it('omits vertices already walked past', () => {
    const trimmed = trimRouteToPosition(LINE, { lat: 1.3, lng: 103.805 })
    expect(trimmed).not.toContainEqual([103.8, 1.3])
  })

  it('adds no connector when the traveller is on the line', () => {
    const trimmed = trimRouteToPosition(LINE, { lat: 1.3, lng: 103.805 })
    // position → 103.81 → 103.82 (the projected point is the position itself)
    expect(trimmed).toHaveLength(3)
  })

  it('bridges a GPS offset with a short connector to the route', () => {
    const trimmed = trimRouteToPosition(LINE, { lat: 1.3005, lng: 103.805 })
    expect(trimmed[0]).toEqual([103.805, 1.3005])
    expect(trimmed[1]).toEqual([103.805, 1.3])
    expect(trimmed).toHaveLength(4)
  })

  it('leaves the route untouched without a position', () => {
    expect(trimRouteToPosition(LINE, null)).toEqual(LINE)
    expect(trimRouteToPosition([], { lat: 1, lng: 1 })).toEqual([])
  })

  it('returns the deviation alongside the trimmed path', () => {
    const { coords, distanceM } = trimRouteAtPosition(LINE, { lat: 1.3005, lng: 103.805 })
    expect(coords[0]).toEqual([103.805, 1.3005])
    expect(distanceM).toBeGreaterThan(50)
    expect(distanceM).toBeLessThan(60)
  })

  it('does not duplicate a vertex the traveller is standing on', () => {
    const trimmed = trimRouteToPosition(LINE, { lat: 1.3, lng: 103.81 })
    expect(trimmed).toEqual([
      [103.81, 1.3],
      [103.82, 1.3]
    ])
  })
})

describe('routeDeviationMeters', () => {
  it('reports how far the traveller is from the route', () => {
    const deviation = routeDeviationMeters(LINE, { lat: 1.3005, lng: 103.805 })
    expect(deviation).toBeGreaterThan(50)
    expect(deviation).toBeLessThan(60)
  })

  it('is zero when the traveller is on the line', () => {
    expect(routeDeviationMeters(LINE, { lat: 1.3, lng: 103.81 })).toBeCloseTo(0, 6)
  })
})
