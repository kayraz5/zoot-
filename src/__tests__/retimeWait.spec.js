import { describe, it, expect } from 'vitest'
import { waitUntilOpen } from '../model/services/hours.js'

const at = (hhmm) => Date.parse(`2026-10-21T${hhmm}:00+08:00`)
const rhapsody = { hours: [['19:40', '21:00']] }

describe('waitUntilOpen: edits wait for a place that opens later instead of refusing', () => {
  it('already open → same time', () => {
    expect(waitUntilOpen(rhapsody, at('19:50'), 20)).toBe(at('19:50'))
  })
  it('early for the show → wait until it opens', () => {
    expect(waitUntilOpen(rhapsody, at('19:10'), 20)).toBe(at('19:40'))
  })
  it('too late, or open all day → no waiting', () => {
    expect(waitUntilOpen(rhapsody, at('20:50'), 20)).toBeNull()
    expect(waitUntilOpen({ hours: '24h' }, at('03:00'), 20)).toBe(at('03:00'))
  })
})
