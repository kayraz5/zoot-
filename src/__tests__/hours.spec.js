import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatOpeningHours,
  formatTime,
  fromSgLocalInput,
  getSgTimeParts,
  isOpenDuringVisit,
  toSgLocalInput,
} from '../model/services/hours.js'
import { hm } from '../view/features/plan/planUi.js'
import { sameSgDay } from '../model/services/checkin.js'
import { forAll, int } from './helpers/gen.js'
import { at, DAY, T, useCleanSlate } from './helpers/index.js'

useCleanSlate()

describe('Singapore opening-hours helpers', () => {
  describe('getSgTimeParts', () => {
    it('returns Singapore minutes since midnight and weekday', () => {
      expect(getSgTimeParts(T('16:30'))).toEqual({ minutes: 990, day: 2 })
    })

    it('handles the end of a Singapore day', () => {
      expect(getSgTimeParts(T('23:59'))).toEqual({ minutes: 1439, day: 2 })
    })
  })

  describe('isOpenDuringVisit', () => {
    it('treats 24-hour places as open for any visit', () => {
      expect(isOpenDuringVisit({ hours: '24h' }, T('23:50'), T('00:20', '2030-01-16'))).toBe(true)
    })

    it('treats a place with missing hours as always open', () => {
      expect(isOpenDuringVisit({}, T('03:00'), T('04:00'))).toBe(true)
    })

    it('rejects visits that arrive on a closed weekday', () => {
      const place = { hours: [['09:00', '17:00']], closed_days: [2] }
      expect(isOpenDuringVisit(place, T('10:00'), T('11:00'))).toBe(false)
      // Same place on Wednesday 2030-01-16 (not a closed day): the rejection above comes from the closed weekday.
      expect(isOpenDuringVisit(place, T('10:00', '2030-01-16'), T('11:00', '2030-01-16'))).toBe(true)
    })

    it('accepts a visit fully inside a daytime range', () => {
      const place = { hours: [['09:00', '17:00']] }
      expect(isOpenDuringVisit(place, T('10:00'), T('11:00'))).toBe(true)
    })

    it('rejects a visit that falls outside a daytime range', () => {
      const place = { hours: [['09:00', '17:00']] }
      expect(isOpenDuringVisit(place, T('17:00'), T('18:00'))).toBe(false)
    })

    it('accepts an arrival on the opening side of an overnight range', () => {
      const place = { hours: [['22:00', '02:00']] }
      expect(isOpenDuringVisit(place, T('23:00'), T('01:00', '2030-01-16'))).toBe(true)
    })

    it('does not match an overnight range when arriving after midnight', () => {
      const place = { hours: [['22:00', '02:00']] }
      expect(isOpenDuringVisit(place, T('01:00', '2030-01-16'), T('01:30', '2030-01-16'))).toBe(false)
    })

    it('treats 23:59 as the end of the day', () => {
      const place = { hours: [['22:00', '23:59']] }
      expect(isOpenDuringVisit(place, T('23:58'), T('00:00', '2030-01-16'))).toBe(true)
    })
  })

  describe('formatOpeningHours', () => {
    it('formats a 24-hour place', () => {
      expect(formatOpeningHours({ hours: '24h' })).toBe('Open 24 hours')
    })

    it('formats ranges, midnight closing, and closed weekdays', () => {
      expect(formatOpeningHours({
        hours: [['07:00', '12:00'], ['18:00', '23:59']],
        closed_days: [0, 2],
      })).toBe('07:00-12:00, 18:00-24:00 · Closed Sun, Tue')
    })
  })

  describe('formatTime', () => {
    it('formats a millisecond timestamp in Singapore time', () => {
      expect(formatTime(T('08:05'))).toBe('08:05')
    })

    it('formats an ISO timestamp in Singapore time', () => {
      expect(formatTime(at('16:05'))).toBe('16:05')
    })
  })

  describe('formatDuration', () => {
    it('formats minute-only, hour-only, and mixed durations', () => {
      expect(formatDuration(0)).toBe('0 min')
      expect(formatDuration(45)).toBe('45 min')
      expect(formatDuration(60)).toBe('1 h')
      expect(formatDuration(80)).toBe('1 h 20 min')
    })

    it('clamps negative durations to zero', () => {
      expect(formatDuration(-15)).toBe('0 min')
    })

    // Feature: test-coverage-expansion, Property 6: Duration formatting preserves minutes
    it('preserves generated duration minutes across both formatters', () => {
      forAll((r) => int(r, -10000, 200000) / 100, (minutes) => {
        const formatted = formatDuration(minutes)
        const formattedMinutes = Number(formatted.match(/^(?:(\d+) h)?(?: ?(\d+) min)?$/)?.[1] || 0) * 60
          + Number(formatted.match(/(\d+) min$/)?.[1] || 0)
        const hmText = hm(minutes)
        const hmMinutes = Number(hmText.match(/^(\d+)H/)?.[1] || 0) * 60
          + Number(hmText.match(/(\d+)M$/)?.[1] || 0)
        const expected = Math.max(0, Math.round(minutes))

        expect(formattedMinutes).toBe(expected)
        expect(hmMinutes).toBe(expected)
        expect(hmMinutes).toBe(formattedMinutes)
      })
    })

    // **Validates: Requirements 2.2, 2.3**
  })

  describe('Singapore local datetime inputs', () => {
    it('converts a timestamp to and from a Singapore local input', () => {
      const timestamp = T('16:30')
      const localInput = toSgLocalInput(timestamp)

      expect(localInput).toBe(`${DAY}T16:30`)
      expect(fromSgLocalInput(localInput)).toBe(timestamp)
    })
  })

  // Feature: test-coverage-expansion, Property 4: Singapore time helpers agree
  it('keeps generated Singapore timestamps consistent across time helpers', () => {
    const timestamp = (r) => {
      const year = int(r, 2026, 2035)
      const month = int(r, 1, 12)
      const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const day = int(r, 1, maxDay)
      const hour = int(r, 0, 23)
      const minute = int(r, 0, 59)
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return Date.parse(at(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, date))
    }

    forAll((r) => ({ first: timestamp(r), second: timestamp(r) }), ({ first, second }) => {
      const firstLocal = toSgLocalInput(first)
      const secondLocal = toSgLocalInput(second)
      const [firstHour, firstMinute] = firstLocal.slice(11, 16).split(':').map(Number)
      const [secondHour, secondMinute] = secondLocal.slice(11, 16).split(':').map(Number)

      expect(fromSgLocalInput(firstLocal)).toBe(first)
      expect(fromSgLocalInput(secondLocal)).toBe(second)
      expect(formatTime(first)).toBe(firstLocal.slice(11, 16))
      expect(formatTime(second)).toBe(secondLocal.slice(11, 16))
      expect(getSgTimeParts(first)).toEqual({
        minutes: firstHour * 60 + firstMinute,
        day: new Date(`${firstLocal.slice(0, 10)}T00:00:00Z`).getUTCDay(),
      })
      expect(getSgTimeParts(second)).toEqual({
        minutes: secondHour * 60 + secondMinute,
        day: new Date(`${secondLocal.slice(0, 10)}T00:00:00Z`).getUTCDay(),
      })
      expect(sameSgDay(first, second)).toBe(firstLocal.slice(0, 10) === secondLocal.slice(0, 10))
    })
  })

  // **Validates: Requirements 2.2, 2.5**
})

