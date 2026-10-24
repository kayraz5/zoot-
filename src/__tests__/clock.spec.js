import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

const BASE_TIME = Date.parse('2030-01-15T12:00:00+08:00')

beforeEach(() => {
  vi.resetModules()
})

async function loadClock(savedOffset) {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_TIME)
  if (savedOffset !== undefined) localStorage.setItem('zoot.clockOffset', savedOffset)
  return import('../model/services/clock.js')
}

describe('clock: application time offset', () => {
  it('adds a saved millisecond offset to now and reports it in minutes', async () => {
    const clock = await loadClock('1800000')

    expect(clock.now()).toBe(BASE_TIME + 1_800_000)
    expect(clock.clockOffsetMin()).toBe(30)
  })

  it('ignores a corrupt saved offset', async () => {
    const clock = await loadClock('abc')

    expect(clock.now()).toBe(BASE_TIME)
    expect(clock.clockOffsetMin()).toBe(0)
  })

  it('persists skipped minutes and updates tick immediately', async () => {
    const clock = await loadClock()

    clock.skipMinutes(15)

    expect(clock.now()).toBe(BASE_TIME + 15 * 60 * 1000)
    expect(clock.clockOffsetMin()).toBe(15)
    expect(localStorage.getItem('zoot.clockOffset')).toBe(String(15 * 60 * 1000))
    expect(clock.tick.value).toBe(clock.now())
  })

  it('resets the offset, removes its saved value, and updates tick', async () => {
    const clock = await loadClock('1800000')

    clock.resetClock()

    expect(clock.now()).toBe(BASE_TIME)
    expect(clock.clockOffsetMin()).toBe(0)
    expect(localStorage.getItem('zoot.clockOffset')).toBeNull()
    expect(clock.tick.value).toBe(BASE_TIME)
  })

  it('updates tick after one second elapses', async () => {
    const clock = await loadClock()

    expect(clock.tick.value).toBe(BASE_TIME)
    vi.advanceTimersByTime(1000)

    expect(clock.tick.value).toBe(BASE_TIME + 1000)
  })
})
