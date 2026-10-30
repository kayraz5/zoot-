import { describe, expect, it } from 'vitest'
import places from '../model/data/places.synced.json'
import { ORIGINS } from '../model/data/origins.js'
import { planDeterministic, leaveByMs } from '../model/services/planner.js'

const T3 = ORIGINS.find((o) => o.id === 'changi-t3')
const T1 = ORIGINS.find((o) => o.id === 'changi-t1')
const NOON_SGT = Date.UTC(2026, 10, 2, 4, 0)

function ctx(extra) {
  return {
    catalog: places, origin: T3, startMs: NOON_SGT, mustReturnMs: NOON_SGT + 9 * 3600e3, cleared: true,
    style: 'budget', interests: ['hawker', 'gardens'], energy: 'med', indoorPref: 'any', maxWalk: 15, partySize: 1,
    rainAt: () => 0, ...extra
  }
}

describe('departure terminal', () => {
  it('ends the quest at the terminal the next flight leaves from', () => {
    const r = planDeterministic(ctx({ returnTo: T1 }))
    expect(r.ok).toBe(true)
    const ret = r.mission.legs.at(-1)
    expect(ret.name).toBe('Return to Changi Airport T1')
    expect([ret.lat, ret.lng]).toEqual([T1.lat, T1.lng])
    expect(r.mission.origin.label).toBe('Changi Airport T3')
    expect(r.mission.return_to.label).toBe('Changi Airport T1')
    // Live "head back by" also aims for T1.
    expect(leaveByMs(r.mission, T1, NOON_SGT).back.minutes).toBeLessThanOrEqual(2)
  })

  it('returns to where it started when no departure terminal is given (older trips)', () => {
    const r = planDeterministic(ctx())
    expect(r.mission.legs.at(-1).name).toBe('Return to Changi Airport T3')
  })
})
