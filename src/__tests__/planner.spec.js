import { beforeEach, describe, expect, it } from 'vitest'
import { placeById } from '../model/services/catalog.js'
import {
  assembleMission,
  buildCandidates,
  computeBudget,
  dangerRefusal,
  greedy,
  groqCatalogSlice,
  keptVisits,
  leaveByMs,
  planDeterministic,
  planValue,
  radiusClusters,
  scorePlace,
  sequencePicks,
  slackMinutes,
  stayMinutes,
  useLeftoverTime,
  xpFor,
} from '../model/services/planner.js'
import { ctx } from './helpers/fixtures.js'
import { setNow, T, useCleanSlate } from './helpers/index.js'

useCleanSlate()

beforeEach(() => {
  setNow(T('09:00'))
})

const place = (id) => placeById.value.get(id)
const planningContext = (overrides = {}) => ctx({ cityRisk: { severity: 0 }, ...overrides })
const visit = (p, overrides = {}) => ({
  p: { ...p, _score: 2 },
  tr: { mode: 'walk', minutes: 5, detail: '400 m on foot' },
  arrive: T('11:00'),
  depart: T('11:00') + 45 * 60000,
  stay: 45,
  back: { mode: 'mrt', minutes: 30, detail: 'MRT Changi Airport → City Hall' },
  ...overrides,
})

describe('planner budget, scoring and candidate selection', () => {
  it('computes airport and hotel budgets with the correct buffers', () => {
    const airport = computeBudget({ origin: ctx().origin, startMs: T('10:00'), mustReturnMs: T('20:00') })
    expect(airport).toMatchObject({
      airport: true,
      exit_min: 30,
      reentry_min: 45,
      safety_min: 45,
      window_min: 600,
      usable_min: 480,
      departMs: T('10:30'),
      arriveByMs: T('18:30'),
    })

    const cleared = computeBudget({ origin: ctx().origin, startMs: T('10:00'), mustReturnMs: T('20:00'), cleared: true })
    expect(cleared).toMatchObject({ exit_min: 0, usable_min: 510, departMs: T('10:00') })

    const hotel = computeBudget({
      origin: { kind: 'hotel', lat: 1.2935, lng: 103.8532 },
      startMs: T('10:00'),
      mustReturnMs: T('20:00'),
    })
    expect(hotel).toMatchObject({ airport: false, exit_min: 0, reentry_min: 0, safety_min: 20, usable_min: 580 })
  })

  it('rounds stays up for low energy and larger parties', () => {
    const p = place('jewel-rain-vortex')
    expect(stayMinutes(p, { energy: 'med', partySize: 1 })).toBe(40)
    expect(stayMinutes(p, { energy: 'low', partySize: 1 })).toBe(45)
    expect(stayMinutes(p, { energy: 'med', partySize: 4 })).toBe(45)
    expect(stayMinutes(p, { energy: 'low', partySize: 4 })).toBe(50)
  })

  it('scores an interested place above an unrelated place and preserves the score floor', () => {
    const budget = computeBudget(ctx())
    const interested = scorePlace(place('merlion-park'), planningContext({ interests: ['photo'] }), budget)
    const unrelated = scorePlace(place('merlion-park'), planningContext({ interests: ['museum'], style: 'party' }), budget)
    const floor = scorePlace({ ...place('merlion-park'), tags: [], captions: [], cost_band: 3 }, planningContext({ interests: [], style: 'budget' }), budget)

    expect(interested).toBeGreaterThan(unrelated)
    expect(floor).toBe(0.2)
  })

  it('refuses only a severity-four city danger alert', () => {
    expect(dangerRefusal({ cityRisk: { severity: 3, headline: 'Warning' } })).toBeNull()
    expect(dangerRefusal({ cityRisk: { severity: 4, headline: 'Severe weather' } })).toContain('Danger alert: Severe weather')
  })

  it('filters candidates for indoor-only planning and exclusions', () => {
    const context = planningContext({
      indoorPref: 'only',
      excludeIds: new Set(['cloud-forest']),
    })
    const candidates = buildCandidates(context, computeBudget(context))

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((p) => p.indoor)).toBe(true)
    expect(candidates.some((p) => p.id === 'cloud-forest')).toBe(false)
    expect(candidates.every((p) => typeof p._score === 'number')).toBe(true)
  })

  it('clusters real catalog candidates so each member stays within its leader radius', () => {
    const candidates = [
      place('jewel-rain-vortex'),
      place('jewel-canopy-park'),
      place('merlion-park'),
    ].map((p, index) => ({ ...p, _score: 3 - index }))
    const clusters = radiusClusters(candidates)

    expect(clusters.length).toBeGreaterThan(0)
    expect(clusters.flatMap((cluster) => cluster.members).map((p) => p.id).sort()).toEqual(candidates.map((p) => p.id).sort())
    for (const cluster of clusters) {
      expect(cluster.members.every((member) => {
        const distance = Math.hypot((member.lat - cluster.leader.lat) * 111000, (member.lng - cluster.leader.lng) * 111000)
        return distance <= 1200
      })).toBe(true)
    }
  })
})

describe('planner route construction and scoring', () => {
  it('builds a non-empty feasible greedy route and leaves empty inputs empty', () => {
    const context = planningContext()
    const budget = computeBudget(context)
    const start = { point: context.origin, ms: budget.departMs }
    const candidates = buildCandidates(context, budget)
    const visits = greedy(context, budget, candidates, { start })

    expect(visits.length).toBeGreaterThan(0)
    expect(visits.every((v) => v.depart + v.back.minutes * 60000 <= budget.arriveByMs)).toBe(true)
    expect(greedy(context, budget, [], { start })).toEqual([])
  })

  it('uses leftover time for a feasible route and returns empty visits unchanged', () => {
    const context = planningContext()
    const budget = computeBudget(context)
    const start = { point: context.origin, ms: budget.departMs }
    const candidates = buildCandidates(context, budget)
    const initial = greedy(context, budget, candidates, { start, limit: 1 })
    const filled = useLeftoverTime(context, budget, candidates, initial, start)

    expect(filled.length).toBeGreaterThan(0)
    expect(filled.length).toBeGreaterThanOrEqual(initial.length)
    expect(filled.every((v) => v.depart + v.back.minutes * 60000 <= budget.arriveByMs)).toBe(true)
    expect(useLeftoverTime(context, budget, candidates, [], start)).toEqual([])
  })

  it('calculates plan value from scores and travel time, with zero for no visits', () => {
    const first = visit(place('cloud-forest'), { stay: 60 })
    const second = visit(place('merlion-park'), { stay: 25, tr: { mode: 'walk', minutes: 8, detail: '640 m on foot' } })

    expect(planValue([])).toBe(0)
    expect(planValue([first, second])).toBeGreaterThan(0)
    expect(planValue([first])).toBeGreaterThan(planValue([]))
  })

  it('calculates XP from stay length, indoor status and curated captions', () => {
    expect(xpFor(place('cloud-forest'), 60)).toBe(95)
    expect(xpFor(place('supertree-grove'), 45)).toBe(95)
  })

  it('assembles visit and return legs with sequential numbers', () => {
    const context = planningContext()
    const budget = computeBudget(context)
    const p = place('jewel-rain-vortex')
    const mission = assembleMission(context, budget, [visit(p)], { id: 'mission-test', source: 'groq' })

    expect(mission).toMatchObject({ schema: 'zoot.mission.v1', id: 'mission-test', source: 'groq' })
    expect(mission.legs).toHaveLength(2)
    expect(mission.legs.map((leg) => leg.seq)).toEqual([1, 2])
    expect(mission.legs[0]).toMatchObject({ kind: 'visit', place_id: p.id, name: p.name })
    expect(mission.legs[1]).toMatchObject({ kind: 'return', place_id: 'origin', status: 'pending' })
  })
})

describe('planner public plan and replanning helpers', () => {
  it('refuses a layover with fewer than 60 usable minutes', () => {
    const result = planDeterministic(planningContext({ mustReturnMs: T('11:00') }))

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/usable minutes after buffers/)
  })

  it('reports the documented message when every selected place id is unknown', () => {
    const result = sequencePicks(planningContext(), ['not-a-real-place'])

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      reason: 'None of the chosen places fit the clock.',
    }))
  })

  it('limits the Groq catalog slice and returns its exact public keys', () => {
    const slice = groqCatalogSlice(planningContext(), 3)

    expect(slice.length).toBeLessThanOrEqual(3)
    expect(slice.length).toBeGreaterThan(0)
    for (const item of slice) {
      expect(Object.keys(item).sort()).toEqual([
        'area', 'cost_band', 'duration_min', 'id', 'indoor', 'name', 'tags',
      ].sort())
    }
  })

  it('keeps only stamped visits and caps their realized stay at the replan time', () => {
    const p = place('merlion-park')
    const other = place('cloud-forest')
    const mission = {
      origin: ctx().origin,
      legs: [
        {
          kind: 'visit', place_id: p.id, status: 'stamped', stamped_at: new Date(T('13:00')).toISOString(),
          arrive_iso: new Date(T('13:00')).toISOString(), depart_iso: new Date(T('13:45')).toISOString(),
          stay_min: 45, travel_mode: 'walk', travel_min: 5, travel_detail: 'walk',
        },
        {
          kind: 'visit', place_id: other.id, status: 'pending',
          arrive_iso: new Date(T('14:00')).toISOString(), depart_iso: new Date(T('15:00')).toISOString(),
          stay_min: 60, travel_mode: 'mrt', travel_min: 20, travel_detail: 'MRT',
        },
        { kind: 'return', arrive_by: new Date(T('18:30')).toISOString() },
      ],
    }
    const kept = keptVisits(mission, placeById.value, T('13:30'))

    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ status: 'stamped', stay: 30, p: { id: p.id } })
    expect(kept[0].depart).toBe(T('13:30'))
  })

  it('reports non-negative slack and a leave-by time no later than arrive-by for a fresh plan', () => {
    const context = planningContext()
    const result = planDeterministic(context)
    expect(result.ok).toBe(true)

    const startMs = Date.parse(result.mission.start_iso)
    const slack = slackMinutes(result.mission, context.origin, startMs, placeById.value)
    const leave = leaveByMs(result.mission, context.origin, startMs)
    const arriveBy = Date.parse(result.mission.legs.at(-1).arrive_by)

    expect(slack).toBeGreaterThanOrEqual(0)
    expect(leave.ms).toBeLessThanOrEqual(arriveBy)
  })
})
