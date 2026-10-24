import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useTripStore } from '../model/stores/trip.js'
import { useUserStore } from '../model/stores/user.js'
import { toSgLocalInput } from '../model/services/hours.js'
import {
  FOOD,
  TILES,
  WALKS,
  hm,
  sgDay,
  usePlanTime,
  usePrePickedInterests,
  useStyleId,
} from '../view/components/plan/planUi.js'
import { T, setNow, useCleanSlate } from './helpers/index.js'
import { tick } from './helpers/fakeClock.js'

vi.mock('../model/services/clock.js', () => import('./helpers/fakeClock.js'))

useCleanSlate()

const runInScope = (fn) => {
  const scope = effectScope()
  const result = scope.run(fn)
  return { result, stop: () => scope.stop() }
}

const setWindow = (trip, arrivalMs, mustReturnMs, { startAtLanding = true, startMs } = {}) => {
  trip.draft.arrivalLocal = toSgLocalInput(arrivalMs)
  trip.draft.mustReturnLocal = toSgLocalInput(mustReturnMs)
  trip.draft.startAtLanding = startAtLanding
  if (startMs !== undefined) trip.draft.startLocal = toSgLocalInput(startMs)
}

beforeEach(() => {
  setNow(T('09:00'))
  tick.value = T('09:00')
  setActivePinia(createPinia())
})

describe('plan UI constants and formatting', () => {
  it('defines interest tiles with ids, labels, icons and catalog tags', () => {
    expect(TILES.length).toBeGreaterThan(0)
    expect(TILES.every((tile) => (
      typeof tile.id === 'string'
      && typeof tile.label === 'string'
      && typeof tile.icon === 'string'
      && Array.isArray(tile.tags)
      && tile.tags.length > 0
    ))).toBe(true)
  })

  it('defines walk choices and food choices with the expected shapes', () => {
    expect(WALKS).toEqual([10, 15, 20, 30])
    expect(FOOD).toEqual([
      { id: 'none', label: 'None' },
      { id: 'halal', label: 'Halal' },
      { id: 'vegetarian', label: 'Vegetarian' },
      { id: 'vegan', label: 'Vegan' },
    ])
  })

  it('formats rounded minutes in upper and pill-case forms, clamping negatives', () => {
    expect(hm(362)).toBe('6H 02M')
    expect(hm(362, false)).toBe('6h 02m')
    expect(hm(-5)).toBe('0H 00M')
  })

  it('formats a timestamp as a Singapore calendar day', () => {
    expect(sgDay(T('12:00'))).toBe('Tue 15 Jan')
  })
})

describe('plan UI composables', () => {
  it('falls back to the budget style for an unknown profile style', () => {
    const user = useUserStore()
    user.profile = { style: 'unrecognised-style' }

    const { result, stop } = runInScope(() => useStyleId())

    expect(result.value).toBe('budget')
    stop()
  })

  it('pre-picks style interests until the traveller touches the selection', async () => {
    const user = useUserStore()
    const trip = useTripStore()
    user.profile = { style: 'budget' }

    const { stop } = runInScope(() => usePrePickedInterests())
    expect(trip.draft.interestsTouched).toBe(false)
    expect(trip.draft.interests).toEqual(['hawker', 'food', 'gardens', 'nature', 'beach', 'views', 'photo'])

    trip.setInterests(['museum'], { touched: true })
    user.profile = { style: 'party' }
    await nextTick()

    expect(trip.draft.interestsTouched).toBe(true)
    expect(trip.draft.interests).toEqual(['museum'])
    stop()
  })

  it('reports the airport buffer, short windows and forecast boundaries', () => {
    const trip = useTripStore()
    setWindow(trip, T('10:00'), T('18:00'))
    const { result, stop } = runInScope(() => usePlanTime())

    expect(result.bufferMin.value).toBe(120)
    expect(result.tooShort.value).toBe(false)
    expect(result.beyondForecast.value).toBe(false)
    stop()

    setWindow(trip, T('10:00'), T('12:30'))
    const shortScope = runInScope(() => usePlanTime())
    expect(shortScope.result.tooShort.value).toBe(true)
    shortScope.stop()

    setWindow(trip, T('10:00', '2030-01-24'), T('18:00', '2030-01-24'))
    const futureScope = runInScope(() => usePlanTime())
    expect(futureScope.result.beyondForecast.value).toBe(true)
    futureScope.stop()
  })

  it('reports when a manually selected start is in the past', () => {
    setNow(T('12:00'))
    tick.value = T('12:00')
    const trip = useTripStore()
    setWindow(trip, T('10:00'), T('18:00'), {
      startAtLanding: false,
      startMs: T('11:00'),
    })

    const { result, stop } = runInScope(() => usePlanTime())

    expect(result.startInPast.value).toBe(true)
    stop()
  })
})
