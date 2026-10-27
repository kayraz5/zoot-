import { describe, expect, it } from 'vitest'
import { airportPlan } from '../model/services/airport.js'

const NOON_SGT = Date.UTC(2026, 9, 25, 4, 0) // 12:00 in Singapore
const MIDNIGHT_SGT = Date.UTC(2026, 9, 25, 16, 0) // 00:00 the next Singapore day
const CITY_HALL = { lat: 1.2932, lng: 103.852 }

function missionWithDeadline(minutesFromNow) {
  return {
    origin: { kind: 'airport', label: 'Changi Airport T3', lat: 1.3568, lng: 103.987 },
    legs: [
      {
        kind: 'return',
        arrive_by: new Date(NOON_SGT + minutesFromNow * 60000).toISOString()
      }
    ]
  }
}

describe('airportPlan', () => {
  it('compares MRT and Grab from the current position', () => {
    const plan = airportPlan({
      from: CITY_HALL,
      mission: missionWithDeadline(180),
      nowMs: NOON_SGT,
      places: [{ name: 'City Hall', lat: CITY_HALL.lat, lng: CITY_HALL.lng }]
    })

    expect(plan.ok).toBe(true)
    expect(plan.destination.label).toBe('Changi Airport T3')
    expect(plan.mrt.available).toBe(true)
    expect(plan.mrt.minutes).toBeGreaterThan(15)
    expect(plan.taxi.minutes).toBeGreaterThan(15)
    expect(plan.taxi.effectiveMinutes).toBe(plan.taxi.minutes + 8)
    expect(plan.recommended).toBe('mrt')
    expect(plan.summary).toContain('MRT')
    expect(plan.pickup.label).toBe('City Hall')
    expect(plan.pickup.hint).toContain('main entrance')
  })

  it('builds readable MRT legs', () => {
    const plan = airportPlan({
      from: CITY_HALL,
      mission: missionWithDeadline(180),
      nowMs: NOON_SGT
    })

    expect(plan.mrt.legs.length).toBeGreaterThan(0)
    for (const leg of plan.mrt.legs) {
      expect(leg.line).toBeTruthy()
      expect(leg.from).toBeTruthy()
      expect(leg.to).toBeTruthy()
    }
    expect(plan.mrt.lines).toContain('EW')
    expect(plan.mrt.station).toBeTruthy()
    expect(plan.mrt.walkToStationMin).toBeGreaterThanOrEqual(0)
    expect(plan.mrt.walkFromStationMin).toBeGreaterThanOrEqual(0)
    expect(plan.mrt.waitMin).toBe(4)
  })

  it('falls back to Grab once the trains have stopped', () => {
    const plan = airportPlan({
      from: CITY_HALL,
      mission: missionWithDeadline(180),
      nowMs: MIDNIGHT_SGT
    })

    expect(plan.mrt.available).toBe(false)
    expect(plan.mrt.note).toContain('last trains')
    expect(plan.recommended).toBe('taxi')
    expect(plan.summary).toContain('Grab')
  })

  it('warns when the deadline cannot be met', () => {
    const plan = airportPlan({
      from: CITY_HALL,
      mission: missionWithDeadline(5),
      nowMs: NOON_SGT
    })

    expect(plan.onTime).toBe(false)
    expect(plan.summary).toContain('Neither option')
    expect(plan.summary).toContain('counter')
  })

  it('reports arrival when there is enough time', () => {
    const plan = airportPlan({
      from: CITY_HALL,
      mission: missionWithDeadline(180),
      nowMs: NOON_SGT
    })

    expect(plan.onTime).toBe(true)
    expect(plan.minutesLeft).toBe(180)
    expect(plan.arrivalMs).toBeGreaterThan(NOON_SGT)
    expect(plan.summary).toContain('before your airport time')
  })

  it('handles a hotel origin by defaulting to Changi Airport', () => {
    const plan = airportPlan({
      from: CITY_HALL,
      mission: { origin: { kind: 'hotel', label: 'Hotel G', lat: 1.3, lng: 103.85 }, legs: [] },
      nowMs: NOON_SGT
    })

    expect(plan.destination.label).toBe('Changi Airport')
    expect(plan.deadlineMs).toBeNull()
    expect(plan.onTime).toBeNull()
  })

  it('asks for a position when GPS is unavailable', () => {
    const plan = airportPlan({ from: null, nowMs: NOON_SGT })
    expect(plan.ok).toBe(false)
    expect(plan.reason).toContain('GPS')
  })

  it('recognises that you are already at the airport', () => {
    const plan = airportPlan({
      from: { lat: 1.357, lng: 103.988 }, // inside the terminal complex
      mission: missionWithDeadline(120),
      nowMs: NOON_SGT
    })

    expect(plan.ok).toBe(true)
    expect(plan.atAirport).toBe(true)
    expect(plan.recommended).toBeNull()
    expect(plan.summary).toContain('already at')
  })
})
