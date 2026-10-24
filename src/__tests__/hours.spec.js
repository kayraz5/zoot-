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
      expect(isOpenDuringVisit({ hours: '24h' }, at('23:50'), at('00:20', '2030-01-16'))).toBe(true)
    })

    it('treats a place with missing hours as always open', () => {
      expect(isOpenDuringVisit({}, at('03:00'), at('04:00'))).toBe(true)
    })

    it('rejects visits that arrive on a closed weekday', () => {
      const place = { hours: [['09:00', '17:00']], closed_days: [2] }
      expect(isOpenDuringVisit(place, at('10:00'), at('11:00'))).toBe(false)
    })

    it('accepts a visit fully inside a daytime range', () => {
      const place = { hours: [['09:00', '17:00']] }
      expect(isOpenDuringVisit(place, at('10:00'), at('11:00'))).toBe(true)
    })

    it('rejects a visit that falls outside a daytime range', () => {
      const place = { hours: [['09:00', '17:00']] }
      expect(isOpenDuringVisit(place, at('17:00'), at('18:00'))).toBe(false)
    })

    it('accepts an arrival on the opening side of an overnight range', () => {
      const place = { hours: [['22:00', '02:00']] }
      expect(isOpenDuringVisit(place, at('23:00'), at('01:00', '2030-01-16'))).toBe(true)
    })

    it('does not match an overnight range when arriving after midnight', () => {
      const place = { hours: [['22:00', '02:00']] }
      expect(isOpenDuringVisit(place, at('01:00', '2030-01-16'), at('01:30', '2030-01-16'))).toBe(false)
    })

    it('treats 23:59 as the end of the day', () => {
      const place = { hours: [['22:00', '23:59']] }
      expect(isOpenDuringVisit(place, at('23:58'), at('00:00', '2030-01-16'))).toBe(true)
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
  })

  describe('Singapore local datetime inputs', () => {
    it('converts a timestamp to and from a Singapore local input', () => {
      const timestamp = T('16:30')
      const localInput = toSgLocalInput(timestamp)

      expect(localInput).toBe(`${DAY}T16:30`)
      expect(fromSgLocalInput(localInput)).toBe(timestamp)
    })
  })
})
