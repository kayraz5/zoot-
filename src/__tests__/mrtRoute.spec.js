import { describe, beforeEach, expect, it, vi } from 'vitest'
import mrtLines from '../model/data/mrtLines.sg.json'
import { HUBS } from '../model/services/travel.js'
import { getWalkRoute } from '../model/services/routing.js'
import { getMrtRoute } from '../model/services/mrtRoute.js'
import { useCleanSlate } from './helpers/index.js'

vi.mock('../model/services/routing.js', () => ({
  getWalkRoute: vi.fn(),
}))

useCleanSlate()

const changiT3 = { lat: 1.3563, lng: 103.9866 }
const cityHall = { lat: 1.2935, lng: 103.8532 }

const twoPointWalk = (from, to) => ({
  coords: [[from.lng, from.lat], [to.lng, to.lat]],
})

beforeEach(() => {
  getWalkRoute.mockImplementation(async (from, to) => twoPointWalk(from, to))
})

describe('MRT route service', () => {
  it('stitches the Changi T3 to City Hall walk and rail geometry', async () => {
    const route = await getMrtRoute(changiT3, cityHall)

    expect(route).toEqual(expect.objectContaining({
      coords: expect.any(Array),
      distance_m: expect.any(Number),
    }))
    expect(route.distance_m).toBeGreaterThan(0)
    expect(route.coords[0]).toEqual([changiT3.lng, changiT3.lat])
    expect(route.coords.at(-1)).toEqual([cityHall.lng, cityHall.lat])
    expect(route.coords).toContainEqual([HUBS.changi_airport.lng, HUBS.changi_airport.lat])
    expect(route.coords).toContainEqual([HUBS.city_hall.lng, HUBS.city_hall.lat])
    expect(getWalkRoute).toHaveBeenCalledTimes(2)
  })

  it('returns null when both points resolve to the same hub', async () => {
    const point = { lat: HUBS.city_hall.lat, lng: HUBS.city_hall.lng }

    await expect(getMrtRoute(point, point)).resolves.toBeNull()
    expect(getWalkRoute).not.toHaveBeenCalled()
  })

  it('returns null when a required walk leg is unavailable', async () => {
    getWalkRoute.mockResolvedValueOnce(null)

    await expect(getMrtRoute(changiT3, cityHall)).resolves.toBeNull()
  })

  it('handles Sentosa Express according to the available MRT geometry', async () => {
    const route = await getMrtRoute(HUBS.harbourfront, HUBS.rws)

    if (!mrtLines.SE) {
      expect(route).toBeNull()
      return
    }

    expect(route).toEqual(expect.objectContaining({
      coords: expect.any(Array),
      distance_m: expect.any(Number),
    }))
    expect(route.distance_m).toBeGreaterThan(0)
    expect(route.coords[0]).toEqual([HUBS.harbourfront.lng, HUBS.harbourfront.lat])
    expect(route.coords.at(-1)).toEqual([HUBS.rws.lng, HUBS.rws.lat])
  })
})
