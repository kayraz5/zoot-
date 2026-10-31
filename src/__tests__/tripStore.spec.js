import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTripStore, isCleared, layoverError } from '../model/stores/trip.js'
import { useUserStore } from '../model/stores/user.js'
import { fromSgLocalInput } from '../model/services/hours.js'
import { T, setNow, useCleanSlate } from './helpers/index.js'
import { tick } from './helpers/fakeClock.js'

vi.mock('../model/services/clock.js', () => import('./helpers/fakeClock.js'))

useCleanSlate()

beforeEach(() => {
  setNow(T('09:02'))
  tick.value = T('09:02')
  setActivePinia(createPinia())
})

describe('trip store defaults and getters', () => {
  it('creates an eight-hour draft with a landing time rounded up to five minutes', () => {
    const trip = useTripStore()

    expect(trip.draft.arrivalLocal).toBe('2030-01-15T10:05')
    expect(trip.draft.mustReturnLocal).toBe('2030-01-15T18:05')
    expect(trip.origin.id).toBe('changi-t3')
    expect(trip.layoverMin).toBe(480)
    expect(trip.startMs).toBe(T('10:05'))
    expect(trip.landed).toBe(false)
    expect(trip.cleared).toBe(false)
  })

  it('reports a landed and cleared trip after enough time has elapsed', () => {
    const trip = useTripStore()
    trip.draft.arrivalLocal = '2030-01-15T10:00'
    trip.draft.mustReturnLocal = '2030-01-15T18:00'
    trip.draft.startAtLanding = false
    trip.draft.startLocal = '2030-01-15T10:30'
    setNow(T('11:00'))
    tick.value = T('11:00')

    expect(trip.landed).toBe(true)
    expect(trip.cleared).toBe(true)
  })
})

describe('trip layover updates', () => {
  it('rejects an invalid layover without changing the draft and accepts a valid one', () => {
    const trip = useTripStore()
    const original = { ...trip.draft }

    expect(trip.setLayover('2030-01-15T10:00', '2030-01-15T14:59')).toBe(
      'Layovers need at least 5 h to leave the airport safely.',
    )
    expect(trip.draft).toEqual(original)

    expect(trip.setLayover('2030-01-15T10:00', '2030-01-15T18:00')).toBe('')
    expect(trip.draft.arrivalLocal).toBe('2030-01-15T10:00')
    expect(trip.draft.mustReturnLocal).toBe('2030-01-15T18:00')
    expect(trip.draft.layoverSet).toBe(true)
  })

  it('clamps a manual start into the current layover window', () => {
    const trip = useTripStore()
    trip.setLayover('2030-01-15T10:00', '2030-01-15T18:00')

    trip.setStart(false, '2030-01-15T08:00')
    expect(fromSgLocalInput(trip.draft.startLocal)).toBe(T('10:00'))

    trip.setStart(false, '2030-01-15T19:00')
    expect(fromSgLocalInput(trip.draft.startLocal)).toBe(T('17:00'))
    expect(trip.draft.startAtLanding).toBe(false)
  })

  it('deduplicates interests and only marks them touched when requested', () => {
    const trip = useTripStore()

    expect(trip.draft.interestsTouched).toBe(false)
    trip.setInterests(['museum', 'museum', 'food'], { touched: false })
    expect(trip.draft.interests).toEqual(['museum', 'food'])
    expect(trip.draft.interestsTouched).toBe(false)

    trip.setInterests(['food', 'food', 'gardens'])
    expect(trip.draft.interests).toEqual(['food', 'gardens'])
    expect(trip.draft.interestsTouched).toBe(true)
  })

  it('saves a trip with the signed-in guest user id', async () => {
    const user = useUserStore()
    const trip = useTripStore()
    await user.continueAsGuest('Mei')

    const saved = await trip.saveTrip()

    expect(saved.id).toEqual(expect.any(String))
    expect(saved.user_id).toBe(user.userId)
    expect(trip.current).toEqual(saved)
  })
})

describe('trip store exported helpers', () => {
  it('identifies cleared trips from origin and elapsed exit time', () => {
    expect(isCleared('jewel', T('10:00'), T('10:00'))).toBe(true)
    expect(isCleared('changi-t3', T('10:00'), T('10:30'))).toBe(true)
    expect(isCleared('changi-t3', T('10:00'), T('10:29'))).toBe(false)
  })

  it('returns every layover validation message and accepts a valid window', () => {
    const now = T('09:00')

    expect(layoverError(NaN, T('18:00'), now)).toBe('Enter both times.')
    expect(layoverError(T('08:00'), T('09:00'), now)).toBe('That flight has already left.')
    expect(layoverError(T('10:00'), T('10:00'), now)).toBe('Your next flight has to leave after you land.')
    expect(layoverError(T('10:00'), T('14:59'), now)).toBe(
      'Layovers need at least 5 h to leave the airport safely.',
    )
    expect(layoverError(T('10:00'), T('10:01', '2030-01-16'), now)).toBe(
      'Layovers are up to 24 h. Longer than that is a stopover.',
    )
    expect(layoverError(T('10:00', '2031-01-16'), T('18:00', '2031-01-16'), now)).toBe(
      'You can plan up to a year ahead.',
    )
    expect(layoverError(T('10:00'), T('18:00'), now)).toBe('')
  })

  it('supports a valid layover at the exact five-hour boundary', () => {
    expect(layoverError(T('10:00'), T('15:00'), T('09:00'))).toBe('')
  })
})
