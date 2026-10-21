import { describe, it, expect } from 'vitest'
import { joinableRange, previewJoin, withTravel } from '../model/services/social.js'
import { restoreOnLeave } from '../model/services/joinResolver.js'
import { retimeMission } from '../model/services/planner.js'

const at = (hhmm) => `2030-01-15T${hhmm}:00+08:00` // a future day: stopsFit ignores plans whose airport time has passed
const T = (hhmm) => Date.parse(at(hhmm))
// Chinatown-ish coordinates so travel() gives short walks.
const pt = { lat: 1.2805, lng: 103.8448 }
const visit = (place_id, from, to, extra = {}) => ({
  kind: 'visit', status: 'pending', place_id, name: place_id, ...pt,
  arrive_iso: at(from), depart_iso: at(to), stay_min: Math.round((T(to) - T(from)) / 60000),
  travel_mode: 'walk', travel_min: 5, travel_detail: 'old note', xp: 50, ...extra
})
const changi = { label: 'Changi Airport', kind: 'airport', lat: 1.3644, lng: 103.9915 }
const mission = (legs, arriveBy = '23:15') => ({
  id: 'm1', origin: changi, start_iso: at('12:00'), must_return_iso: at('23:59'), style: 'budget',
  buffers: { exit_min: 30, reentry_min: 30, safety_min: 15 }, prefs: {},
  legs: [...legs, { kind: 'return', status: 'pending', name: 'Back to Changi', arrive_by: at(arriveBy), arrive_iso: at('22:00'), depart_iso: at('22:00') }]
})
const quest = (stops) => ({
  id: 'q1', title: 'Chinatown', roster: [{ role: 'host', display_name: 'Mei' }],
  stops: stops.map((s, i) => ({ ...s, seq: i + 1 }))
})

describe('joinableRange: which window stops I can pick', () => {
  const q = quest([visit('a', '13:00', '13:40'), visit('b', '14:00', '14:40'), visit('c', '20:00', '21:00'), visit('d', '22:30', '23:00')])
  it('stops before I am out of the airport are too early; ones ending too late for my flight are too late', () => {
    // Out at 12:30 (12:00 + 30 min immigration); back-by 22:00 means stop d (ends 23:00) can't be the last.
    const m = mission([], '22:00')
    expect(joinableRange(q.stops, m, T('12:45'))).toEqual({ minFrom: 1, maxTo: 3 })
    expect(joinableRange(q.stops, m, T('13:30'))).toEqual({ minFrom: 2, maxTo: 3 })
  })
  it('nothing fits → minFrom > maxTo', () => {
    const r = joinableRange(q.stops, mission([], '13:00'), T('12:45'))
    expect(r.minFrom > r.maxTo).toBe(true)
  })
})

describe('previewJoin + withTravel: the plan after joining', () => {
  const own = [visit('gbtb', '13:30', '16:30'), visit('superpark', '17:00', '19:00'), visit('dinner', '19:20', '20:00')]
  const q = quest([visit('maxwell', '18:20', '19:10'), visit('temple', '19:30', '20:10')])

  it('uses the resolver (overlap + gap removals) and names the host', () => {
    const p = previewJoin(q, 1, 1, mission(own))
    expect(p.ok).toBe(true)
    expect(p.hostName).toBe('Mei')
    expect(p.removed.map((r) => r.leg.place_id)).toEqual(['superpark', 'dinner'])
    expect(p.blocks[0]).toMatchObject({ fixed: true, party_id: 'q1', with_host: 'Mei' })
  })

  it('refuses with the flight reason when it ends too late', () => {
    const p = previewJoin(q, 1, 2, mission(own, '20:30'))
    expect(p.ok).toBe(false)
    expect(p.reason).toMatch(/^Ends too late for your flight/)
  })

  it('withTravel rewrites travel notes but never moves a stop', () => {
    const p = previewJoin(q, 1, 1, mission(own))
    const legs = withTravel(p.legs, mission(own))
    for (const l of legs.filter((x) => x.kind === 'visit')) {
      const before = p.legs.find((x) => x.place_id === l.place_id)
      expect([l.arrive_iso, l.depart_iso]).toEqual([before.arrive_iso, before.depart_iso])
      expect(['walk', 'mrt', 'taxi']).toContain(l.travel_mode) // mission_legs requires a mode
    }
    expect(legs.find((l) => l.fixed).travel_detail).toBe('Meet Mei at maxwell')
    expect(legs[0].travel_detail).not.toBe('old note')
    expect(Date.parse(legs.at(-1).arrive_iso)).toBeGreaterThan(T('19:10'))
  })
})

describe('edits after joining', () => {
  const catalogById = new Map()
  it('retimeMission keeps joined stops at their fixed time', () => {
    const legs = [visit('a', '13:00', '13:30'), visit('maxwell', '15:00', '15:45', { fixed: true, party_id: 'q1', with_host: 'Mei' })]
    const { mission: out, problems } = retimeMission(mission(legs), { start: { point: pt, ms: T('12:50') }, catalogById })
    expect(problems).toEqual([])
    const block = out.legs.find((l) => l.fixed)
    expect([Date.parse(block.arrive_iso), Date.parse(block.depart_iso)]).toEqual([T('15:00'), T('15:45')])
  })
  it('refuses an edit that would make me late to meet the group', () => {
    const legs = [visit('a', '13:00', '14:50'), visit('maxwell', '14:55', '15:45', { fixed: true, party_id: 'q1', with_host: 'Mei' })]
    legs[0].stay_min = 150 // stretched past the meet-up
    const { problems } = retimeMission(mission(legs), { start: { point: pt, ms: T('12:50') }, catalogById })
    expect(problems[0]).toMatch(/late to meet Mei at maxwell/)
  })
  it('leaving keeps joined stops I already stamped', () => {
    const legs = [
      visit('maxwell', '13:00', '13:45', { fixed: true, party_id: 'q1', status: 'stamped' }),
      visit('temple', '14:00', '14:40', { fixed: true, party_id: 'q1' })
    ]
    const { legs: out } = restoreOnLeave({ legs, removed: [], partyId: 'q1', nowMs: T('13:50') })
    expect(out.map((l) => l.place_id)).toEqual(['maxwell'])
  })
})
