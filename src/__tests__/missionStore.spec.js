import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { at, jsonResponse, T, setNow, stubFetch, useCleanSlate } from './helpers/index.js'
import { missionFixture } from './helpers/fixtures.js'
import { tick } from './helpers/fakeClock.js'
import { catalog, placeById } from '../model/services/catalog.js'
import { getDb } from '../model/services/db/index.js'
import { useMissionStore } from '../model/stores/mission.js'
import { usePassportStore } from '../model/stores/passport.js'
import { useUiStore } from '../model/stores/ui.js'
import { useUserStore } from '../model/stores/user.js'

const weather = vi.hoisted(() => ({
  fetchForecast: vi.fn(async () => ({ current: {}, hours: [] })),
  fetchHaze: vi.fn(),
  fetchLightning: vi.fn(),
  rainLookup: vi.fn(() => 0),
}))

vi.mock('../model/services/weather.js', () => weather)
vi.mock('../model/services/clock.js', () => import('./helpers/fakeClock.js'))

useCleanSlate()

beforeEach(() => {
  setActivePinia(createPinia())
  setNow(T('12:00'))
  tick.value = T('12:00')
  weather.fetchForecast.mockClear()
  weather.fetchForecast.mockResolvedValue({ current: {}, hours: [] })
})

function visitLeg(placeId = 'jewel-rain-vortex', extra = {}) {
  const place = placeById.value.get(placeId) || catalog.value[0]
  return {
    seq: 1,
    kind: 'visit',
    status: 'pending',
    place_id: place.id,
    name: place.name,
    area: place.area,
    lat: place.lat,
    lng: place.lng,
    arrive_iso: at('13:00'),
    depart_iso: at('13:40'),
    stay_min: 40,
    travel_mode: 'walk',
    travel_min: 5,
    travel_detail: '5 min walk',
    xp: 50,
    ...extra,
  }
}

function missionWithVisits(legs, arriveBy = '20:00') {
  const mission = missionFixture(legs, arriveBy)
  mission.legs.forEach((leg, index) => { leg.seq = index + 1 })
  mission.created_at = at('11:00')
  return mission
}

async function drainSyncHostedWindow() {
  await vi.waitFor(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('mission store initial state and getters', () => {
  it('starts idle with no active mission and empty derived values', () => {
    const store = useMissionStore()

    expect(store.mission).toBeNull()
    expect(store.status).toBe('idle')
    expect(store.legs).toEqual([])
    expect(store.visitLegs).toEqual([])
    expect(store.returnLeg).toBeNull()
    expect(store.nextLeg).toBeNull()
    expect(store.stampedCount).toBe(0)
    expect(store.arriveByMs).toBeNull()
    expect(store.mustReturnMs).toBeNull()
    expect(store.missionPlaceIds).toEqual(new Set())
    expect(store.joinedQuest).toBeNull()
  })

  it('derives visits, return timing, pending next leg and place ids from a mission', () => {
    const first = visitLeg('jewel-rain-vortex')
    const second = visitLeg('jewel-canopy-park', { seq: 2, status: 'pending' })
    const mission = missionWithVisits([first, second], '20:00')
    const store = useMissionStore()
    store.mission = mission
    store.status = 'ready'

    expect(store.legs).toHaveLength(3)
    expect(store.visitLegs).toEqual([first, second])
    expect(store.returnLeg).toMatchObject({ kind: 'return', status: 'pending' })
    expect(store.nextLeg).toBe(store.visitLegs[0])
    expect(store.stampedCount).toBe(0)
    expect(store.arriveByMs).toBe(T('20:00'))
    expect(store.mustReturnMs).toBe(T('23:59'))
    expect(store.missionPlaceIds).toEqual(new Set(['jewel-rain-vortex', 'jewel-canopy-park']))
    expect(store.joinedQuest).toBeNull()
  })
})

describe('mission planning and persistence', () => {
  it('falls back from an unavailable plan API and saves the active mission', async () => {
    stubFetch([
      ['/api/plan', () => jsonResponse({ error: 'Groq unavailable' }, 503)],
    ])
    const store = useMissionStore()
    const trip = {
      id: 'trip-fallback',
      origin: missionFixture([]).origin,
      start_at: at('10:00'),
      must_return_at: at('20:00'),
      cleared: false,
      style: 'budget',
      interests: ['gardens'],
      energy: 'med',
      maxWalk: 15,
      partySize: 1,
    }

    const mission = await store.planFromTrip(trip)
    await drainSyncHostedWindow()

    expect(store.status).toBe('ready')
    expect(store.lastSource).toBe('fallback')
    expect(mission).toBe(store.mission)
    expect(mission).toMatchObject({ trip_id: 'trip-fallback', source: 'fallback' })
    expect(localStorage.getItem('zoot.activeMission')).toBe(mission.id)
    expect(await (await getDb()).getMission(mission.id)).toEqual(mission)
    expect(weather.fetchForecast).toHaveBeenCalledTimes(1)
  })

  it('refuses a short layover and records the planner refusal', async () => {
    const store = useMissionStore()
    const trip = {
      id: 'trip-short',
      origin: missionFixture([]).origin,
      start_at: at('10:00'),
      must_return_at: at('11:00'),
      cleared: false,
      style: 'budget',
      interests: [],
      energy: 'med',
      maxWalk: 15,
      partySize: 1,
    }

    const result = await store.planFromTrip(trip)
    await drainSyncHostedWindow()

    expect(result).toBeNull()
    expect(store.status).toBe('error')
    expect(store.refusal).toMatch(/usable minutes after buffers|Stay airside/)
    expect(store.mission).toBeNull()
  })

  it('loads a mission by id and loads the latest mission when no active id is stored', async () => {
    const db = await getDb()
    const stored = missionWithVisits([visitLeg()], '20:00')
    stored.id = 'stored-mission'
    stored.created_at = at('10:00')
    await db.saveMission(stored)
    localStorage.setItem('zoot.activeMission', stored.id)

    const store = useMissionStore()
    await expect(store.load(stored.id)).resolves.toEqual(stored)
    expect(store.status).toBe('ready')
    expect(localStorage.getItem('zoot.activeMission')).toBe('stored-mission')

    const latest = missionWithVisits([visitLeg('jewel-canopy-park')], '20:00')
    latest.id = 'latest-mission'
    latest.created_at = at('11:00')
    await db.saveMission(latest)
    store.mission = null
    localStorage.removeItem('zoot.activeMission')

    await expect(store.loadActive()).resolves.toEqual(latest)
    expect(store.mission).toBe(latest)
    expect(localStorage.getItem('zoot.activeMission')).toBe('latest-mission')
    await drainSyncHostedWindow()
  })

  it('marks a selected leg as skipped and persists the mission', async () => {
    const leg = visitLeg()
    const mission = missionWithVisits([leg], '20:00')
    const store = useMissionStore()
    store.mission = mission

    await store.skip(leg)
    await drainSyncHostedWindow()

    expect(store.mission.legs[0].status).toBe('skipped')
    expect(await (await getDb()).getMission(mission.id)).toEqual(store.mission)
  })
})

describe('mission stamping and completion', () => {
  it('stamps a known place in dev mode and updates the passport, xp and celebration', async () => {
    const user = useUserStore()
    await user.continueAsGuest('Mei')
    const passport = usePassportStore()
    const place = placeById.value.get('jewel-rain-vortex')
    const leg = visitLeg(place.id, { xp: 65 })
    const mission = missionWithVisits([leg], '20:00')
    const store = useMissionStore()
    store.mission = mission

    await store.stamp(leg, { dev: true })
    await drainSyncHostedWindow()

    expect(store.mission.legs[0]).toMatchObject({ status: 'stamped', place_id: place.id })
    expect(passport.stamps).toHaveLength(1)
    expect(passport.stamps[0]).toMatchObject({ place_id: place.id, user_id: user.userId, xp: 65 })
    expect(user.profile.xp).toBe(65)
    expect(useUiStore().celebration).toMatchObject({ place, xp: 65, area: place.area })
  })

  it('rejects a stamp for an unknown place', async () => {
    const store = useMissionStore()

    await expect(store.stamp({ place_id: 'not-in-the-catalog', seq: 1, xp: 10 }, { dev: true }))
      .rejects.toThrow('Unknown place')
  })

  it('refuses to remove the only stop and shows a warning toast', async () => {
    const leg = visitLeg()
    const store = useMissionStore()
    store.mission = missionWithVisits([leg], '20:00')
    const ui = useUiStore()

    await expect(store.removeStop(leg)).resolves.toBe(false)

    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0]).toMatchObject({
      variant: 'warning',
      message: 'A mission needs at least one stop. Swap it instead.',
    })
  })

  it('completes the return leg on time and awards its return bonus', async () => {
    const user = useUserStore()
    await user.continueAsGuest('Mei')
    const mission = missionWithVisits([visitLeg()], '20:00')
    const returnLeg = mission.legs.at(-1)
    returnLeg.xp = 100
    const store = useMissionStore()
    store.mission = mission
    setNow(T('19:00'))
    tick.value = T('19:00')

    await store.completeReturn()
    await drainSyncHostedWindow()

    expect(store.returnLeg.status).toBe('stamped')
    expect(store.mission.completed).toBe(true)
    expect(user.profile.xp).toBe(100)
    expect(useUiStore().celebration).toEqual({ returned: true, onTime: true, xp: 100 })
  })
})
