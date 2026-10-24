import { describe, expect, it } from 'vitest'
import { HUBS, mrtRunning, nearestHub, rideMinutes, transit, travel, walkMinutes } from '../model/services/travel.js'
import { T, useCleanSlate } from './helpers/index.js'

useCleanSlate()

const changiT3 = { lat: 1.3563, lng: 103.9866 }
const cityHall = { lat: 1.2935, lng: 103.8532 }

// Requirements: 1.3, 2.1, 2.2, 2.3
describe('mrtRunning', () => {
  it('treats a missing departure time as running', () => {
    expect(mrtRunning(null)).toBe(true)
  })

  it('opens at 05:30 and closes at 23:30 Singapore time', () => {
    expect(mrtRunning(T('05:29'))).toBe(false)
    expect(mrtRunning(T('05:30'))).toBe(true)
    expect(mrtRunning(T('23:29'))).toBe(true)
    expect(mrtRunning(T('23:30'))).toBe(false)
  })
})

describe('rideMinutes', () => {
  it('returns zero minutes and no lines for the same hub', () => {
    expect(rideMinutes('bugis', 'bugis')).toEqual({
      minutes: 0,
      lines: [],
      path: ['bugis'],
      edgeLines: [],
    })
  })

  it('returns the direct ride time and line for adjacent hubs', () => {
    expect(rideMinutes('eunos', 'paya_lebar')).toMatchObject({
      minutes: 2,
      lines: ['EW'],
      path: ['eunos', 'paya_lebar'],
      edgeLines: ['EW'],
    })
  })

  it('adds four minutes when a ride transfers between lines', () => {
    const continuation = rideMinutes('tanah_merah', 'city_hall')
    const transfer = rideMinutes('changi_airport', 'city_hall')

    expect(continuation.lines).toEqual(['EW'])
    expect(transfer.minutes).toBe(5 + continuation.minutes + 4)
    expect(transfer.lines).toEqual(['CG', 'EW'])
  })
})

describe('walking and transit helpers', () => {
  it('keeps walking time at least one minute, even at the same point', () => {
    expect(walkMinutes(HUBS.bugis, HUBS.bugis)).toBe(1)
  })

  it('finds the Bugis hub when given its exact location', () => {
    expect(nearestHub(HUBS.bugis)).toMatchObject({
      id: 'bugis',
      name: 'Bugis',
      walk_min: 1,
    })
  })

  it('returns no transit for the same hub and a route for distant hubs', () => {
    expect(transit(HUBS.bugis, HUBS.bugis)).toBeNull()

    expect(transit(changiT3, cityHall)).toMatchObject({
      fromHub: 'changi_airport',
      toHub: 'city_hall',
      minutes: expect.any(Number),
      lines: ['CG', 'EW'],
    })
  })
})

describe('travel mode selection', () => {
  it('chooses walking for a short trip', () => {
    const nearby = { lat: HUBS.bugis.lat + 0.001, lng: HUBS.bugis.lng }

    expect(travel(HUBS.bugis, nearby, { atMs: T('12:00') })).toMatchObject({
      mode: 'walk',
      minutes: expect.any(Number),
      detail: expect.stringMatching(/on foot$/),
    })
  })

  it('chooses a taxi when the MRT is closed at 03:00 Singapore time', () => {
    expect(travel(changiT3, cityHall, { atMs: T('03:00') })).toMatchObject({
      mode: 'taxi',
      detail: 'Taxi / Grab · MRT closed at this hour',
    })
  })

  it('keeps a budget traveller on the MRT when it is available', () => {
    expect(travel(changiT3, cityHall, {
      atMs: T('12:00'),
      style: 'budget',
    })).toMatchObject({
      mode: 'mrt',
      detail: expect.stringContaining('MRT'),
    })
  })
})
