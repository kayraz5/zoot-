import { describe, expect, it } from 'vitest'
import { at, T, useCleanSlate } from './helpers/index.js'
import { forAll, int } from './helpers/gen.js'
import { CHECKIN } from '../model/services/config.js'
import { checkInStatus, getSgTimeParts, radiusFor, sameSgDay } from '../model/services/checkin.js'

useCleanSlate()

const place = { lat: 1.2903, lng: 103.8519 }

const positionAt = (accuracy = 5, overrides = {}) => ({
  lat: place.lat,
  lng: place.lng,
  accuracy,
  ...overrides,
})

describe('radiusFor', () => {
  it('keeps the normal radius at exactly 50 metres of accuracy', () => {
    expect(radiusFor(50)).toBe(80)
  })

  it('uses the wider radius above the poor-accuracy boundary', () => {
    expect(radiusFor(51)).toBe(120)
  })
})

describe('checkInStatus', () => {
  it('reports no GPS when a position is unavailable', () => {
    expect(checkInStatus({ place, position: null })).toEqual({
      ok: false,
      code: 'no_gps',
      message: 'Waiting for GPS…',
    })
  })

  it('rejects poor GPS accuracy unless fake mode is enabled', () => {
    const poorPosition = positionAt(200)

    expect(checkInStatus({ place, position: poorPosition })).toMatchObject({
      ok: false,
      code: 'accuracy',
    })
    expect(checkInStatus({ place, position: { ...poorPosition, accuracy: undefined } })).toMatchObject({
      ok: false,
      code: 'accuracy',
    })
    expect(checkInStatus({ place, position: poorPosition, fake: true })).toMatchObject({
      ok: true,
      radius: 120,
      distance: 0,
    })
  })

  it('rejects a position that is farther away than the geofence radius', () => {
    const result = checkInStatus({
      place,
      position: positionAt(5, { lat: place.lat + 0.002 }),
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe('far')
    expect(result.distance).toBeGreaterThan(result.radius)
    expect(result.radius).toBe(80)
  })

  it('accepts a position within the geofence radius', () => {
    expect(checkInStatus({ place, position: positionAt() })).toMatchObject({
      ok: true,
      distance: 0,
      radius: 80,
      message: 'In range. Stamp it!',
    })
  })

  // Feature: test-coverage-expansion, Property 5: Check-in geofence rule
  it('follows configured radius and fake-mode accuracy rules for generated positions', () => {
    forAll((r) => ({
      accuracy: int(r, 0, 200),
      distanceM: int(r, 0, 200),
      fake: r() < 0.5,
    }), ({ accuracy, distanceM, fake }) => {
      const position = positionAt(accuracy, {
        lat: place.lat + distanceM / 111_320,
      })
      const result = checkInStatus({ place, position, fake })
      const radius = accuracy > CHECKIN.poorAccuracyM
        ? CHECKIN.poorAccuracyRadiusM
        : CHECKIN.radiusM

      if (!fake && accuracy > CHECKIN.rejectAccuracyM) {
        expect(result).toMatchObject({ ok: false, code: 'accuracy' })
        return
      }

      expect(result.radius).toBe(radius)
      expect(result.ok).toBe(result.distance <= radius)
    })
  })

  // **Validates: Requirements 2.2, 2.3**
})


describe('Singapore day helpers', () => {
  it('rolls to the next Singapore day at 16:00Z', () => {
    const beforeMidnight = T('23:59', '2030-01-15')
    const singaporeMidnight = T('00:00', '2030-01-16')
    const afterMidnight = T('00:01', '2030-01-16')

    expect(at('00:00', '2030-01-16')).toBe('2030-01-16T00:00:00+08:00')
    expect(sameSgDay(beforeMidnight, singaporeMidnight)).toBe(false)
    expect(sameSgDay(singaporeMidnight, afterMidnight)).toBe(true)
  })

  it('re-exports the Singapore time parts helper', () => {
    expect(getSgTimeParts(T('16:30', '2030-01-15'))).toEqual({
      minutes: 990,
      day: 2,
    })
  })
})
