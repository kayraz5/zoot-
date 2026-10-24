import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { at, T, setNow, useCleanSlate } from './helpers/index.js'
import { missionFixture } from './helpers/fixtures.js'
import { tick } from './helpers/fakeClock.js'
import { geo, setFake } from '../model/services/geo.js'
import { useMissionStore } from '../model/stores/mission.js'
import { useMissionNav } from '../view/composables/useMissionNav.js'

vi.mock('../model/services/clock.js', () => import('./helpers/fakeClock.js'))

const STOP = { lat: 1.2805, lng: 103.8448 }

function visitLeg(placeId, point = STOP, extra = {}) {
  return {
    kind: 'visit',
    status: 'pending',
    place_id: placeId,
    name: placeId,
    ...point,
    arrive_iso: at('13:00'),
    depart_iso: at('13:40'),
    stay_min: 40,
    travel_mode: 'walk',
    travel_min: 5,
    xp: 50,
    ...extra,
  }
}

function setup() {
  setActivePinia(createPinia())
  const store = useMissionStore()
  store.mission = missionFixture([
    visitLeg('stop-a'),
    visitLeg('stop-b', { lat: 1.281, lng: 103.8455 }),
  ], '20:00')
  const returnLeg = store.mission.legs.at(-1)
  returnLeg.lat = store.mission.origin.lat
  returnLeg.lng = store.mission.origin.lng
  store.status = 'ready'
  setNow(T('12:00'))
  tick.value = T('12:00')
  return { store, nav: useMissionNav() }
}

function clearGeo() {
  Object.assign(geo, { lat: null, lng: null, accuracy: null, source: null, fake: false })
}

useCleanSlate()
beforeEach(clearGeo)

describe('useMissionNav: next-stop navigation state', () => {
  it('selects the first pending visit and numbers it among the visits', () => {
    const { nav } = setup()

    expect(nav.next.value.place_id).toBe('stop-a')
    expect(nav.stopNumber.value).toBe('1/2')
  })

  it('waits for GPS when the next visit has no position fix', () => {
    const { nav } = setup()

    expect(nav.check.value).toEqual({ ok: false, code: 'no_gps', message: 'Waiting for GPS…' })
  })

  it('reports a visit as in range when fake GPS is on the stop', () => {
    const { nav } = setup()
    setFake(true, STOP)

    expect(nav.check.value.ok).toBe(true)
    expect(nav.check.value.message).toBe('In range. Stamp it!')
  })

  it('uses the wider radius for the return leg', () => {
    const { store, nav } = setup()
    store.visitLegs.forEach((leg) => { leg.status = 'stamped' })
    const origin = store.mission.origin

    setFake(true, origin)
    expect(nav.next.value.kind).toBe('return')
    expect(nav.check.value.ok).toBe(true)
    expect(nav.check.value.message).toContain("You're back at Back to Changi")

    setFake(true, { lat: origin.lat + 0.01, lng: origin.lng })
    expect(nav.check.value.ok).toBe(false)
    expect(nav.check.value.message).toContain('Get within 300 m to finish.')
  })
})

describe('useMissionNav: time, distance and guidance helpers', () => {
  it('formats missing, metre and kilometre distances', () => {
    const { nav } = setup()

    expect(nav.formatDistance(null)).toBe('')
    expect(nav.formatDistance(123)).toBe('120 m')
    expect(nav.formatDistance(1234)).toBe('1.2 km')
  })

  it('counts down to the mission deadline', () => {
    const { nav } = setup()
    const now = Date.parse('2030-01-15T22:57:59+08:00')
    setNow(now)
    tick.value = now

    expect(nav.countdown.value).toBe('1:01:01')
  })

  it('marks under 45 minutes critical and under 90 minutes warning', () => {
    const { nav } = setup()

    tick.value = T('23:15')
    expect(nav.isTimeCritical.value).toBe(true)
    expect(nav.isTimeWarning.value).toBe(false)

    tick.value = T('22:30')
    expect(nav.isTimeCritical.value).toBe(false)
    expect(nav.isTimeWarning.value).toBe(true)

    tick.value = T('22:29')
    expect(nav.isTimeCritical.value).toBe(false)
    expect(nav.isTimeWarning.value).toBe(false)
  })

  it('gives the arrived guidance when the next stop is within 40 metres', () => {
    const { nav } = setup()
    setFake(true, STOP)

    expect(nav.guidance.value).toEqual({
      icon: 'bi-flag-fill',
      text: "You're there. Look around for the spot.",
    })
  })

  it('reports a negative lateBy when early and a positive value when late', () => {
    const { nav } = setup()
    setFake(true, STOP)

    const early = T('12:00')
    setNow(early)
    tick.value = early
    expect(nav.lateBy.value).toBe(-59)

    const late = T('13:00')
    setNow(late)
    tick.value = late
    expect(nav.lateBy.value).toBe(1)
  })
})
