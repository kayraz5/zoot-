import { describe, it, expect } from 'vitest'
import { resolveJoin, restoreOnLeave, GAP_MIN } from '../model/services/joinResolver.js'

// Singapore times on one day, as ISO strings (the shape mission legs use).
const at = (hhmm) => `2026-10-21T${hhmm}:00+08:00`
const T = (hhmm) => Date.parse(at(hhmm))

const visit = (place_id, name, from, to, extra = {}) => ({
  kind: 'visit', status: 'pending', place_id, name, arrive_iso: at(from), depart_iso: at(to), stay_min: (T(to) - T(from)) / 60000, ...extra
})

/** The guest's plan from the spec's worked example. Airport 23:15 = strict back-at-airport time. */
function guestPlan() {
  return [
    visit('gardens-by-the-bay', 'GBTB', '13:30', '16:30'),
    visit('superpark', 'Superpark', '17:00', '19:00'),
    visit('esplanade-dinner', 'Dinner Esplanade', '19:20', '20:00'),
    visit('paya-lebar-drinks', 'Drinks Paya Lebar', '20:40', '22:00'),
    { kind: 'return', status: 'pending', name: 'Changi Airport T3', arrive_iso: at('23:15'), arrive_by: at('23:15') }
  ]
}
const hostStop = (place_id, name, from, to) => ({ kind: 'visit', place_id, name, arrive_iso: at(from), depart_iso: at(to), xp: 60 })

function join(joinStops, { backMin = 45, airport = '23:15', legs = guestPlan() } = {}) {
  return resolveJoin({ legs, joinStops, hostName: 'Mei', partyId: 'p1', airportByMs: T(airport), backMin })
}
const names = (list) => list.map((x) => (x.leg || x).name)

describe('resolveJoin: worked examples from the spec', () => {
  it('Join MBS 20:45–21:45 → Drinks removed (overlap); the rest kept', () => {
    const r = join([hostStop('mbs', 'MBS', '20:45', '21:45')])
    expect(r.ok).toBe(true)
    expect(names(r.removed)).toEqual(['Drinks Paya Lebar'])
    expect(r.removed[0].why).toBe('overlap')
    expect(names(r.kept)).toEqual(['GBTB', 'Superpark', 'Dinner Esplanade'])
  })

  it('Join dinner 18:20–19:10 → Superpark (overlap) and Dinner Esplanade (10 min gap) removed', () => {
    const r = join([hostStop('lau-pa-sat', 'Dinner with Mei', '18:20', '19:10')])
    expect(names(r.removed)).toEqual(['Superpark', 'Dinner Esplanade'])
    expect(r.removed.map((x) => x.why)).toEqual(['overlap', 'gap'])
    expect(r.removed[1].gapMin).toBe(10)
    expect(names(r.kept)).toEqual(['GBTB', 'Drinks Paya Lebar'])
  })

  it('Join 18:20–20:30 → Superpark, Dinner Esplanade and Drinks (10 min gap) removed', () => {
    const r = join([hostStop('a', 'Dinner with Mei', '18:20', '19:30'), hostStop('b', 'Walk with Mei', '19:40', '20:30')])
    expect(names(r.removed)).toEqual(['Superpark', 'Dinner Esplanade', 'Drinks Paya Lebar'])
    expect(r.removed.map((x) => x.why)).toEqual(['overlap', 'overlap', 'gap'])
    expect(names(r.kept)).toEqual(['GBTB'])
  })

  it('Join 15:00–18:00 → GBTB and Superpark removed', () => {
    const r = join([hostStop('x', 'Afternoon with Mei', '15:00', '18:00')])
    expect(names(r.removed)).toEqual(['GBTB', 'Superpark'])
    expect(names(r.kept)).toEqual(['Dinner Esplanade', 'Drinks Paya Lebar'])
  })
})

describe('resolveJoin: rules', () => {
  it('rule 1: joined stops become fixed blocks tagged with the host, in time order', () => {
    const r = join([hostStop('mbs', 'MBS', '20:45', '21:45')])
    const block = r.legs.find((l) => l.fixed)
    expect(block).toMatchObject({ fixed: true, with_host: 'Mei', party_id: 'p1', status: 'pending', name: 'MBS' })
    expect(r.legs.map((l) => l.name)).toEqual(['GBTB', 'Superpark', 'Dinner Esplanade', 'MBS', 'Changi Airport T3'])
    expect(r.legs.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5])
  })

  it('rule 3: a gap of exactly 15 min is fine; 14 min is not', () => {
    expect(GAP_MIN).toBe(15)
    const ok = join([hostStop('x', 'X', '16:45', '16:45')]) // 15 min after GBTB, 15 before Superpark
    expect(names(ok.removed)).toEqual([])
    const tight = join([hostStop('x', 'X', '16:44', '16:46')]) // 14 min either side
    expect(names(tight.removed)).toEqual(['GBTB', 'Superpark'])
  })

  it('rule 3 only looks at the nearest stop on each side (one pass, no cascade)', () => {
    const r = join([hostStop('x', 'X', '20:05', '20:30')]) // Dinner ends 20:00 (5 min), Drinks 20:40 (10 min)
    expect(names(r.removed)).toEqual(['Dinner Esplanade', 'Drinks Paya Lebar'])
    expect(names(r.kept)).toEqual(['GBTB', 'Superpark'])
  })

  it('rule 4: refused when window end + real travel is after the airport time', () => {
    const r = join([hostStop('mbs', 'MBS', '21:00', '22:30')], { backMin: 50 }) // 22:30 + 50 = 23:20 > 23:15
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('Ends too late for your flight')
    expect(r.legs).toBeNull()
    const justFits = join([hostStop('mbs', 'MBS', '21:00', '22:25')], { backMin: 50 }) // 23:15 exactly
    expect(justFits.ok).toBe(true)
  })

  it('rule 5: big change when 2+ stops go, or any 2+ hour stop goes', () => {
    expect(join([hostStop('mbs', 'MBS', '20:45', '21:45')]).bigChange).toBe(false) // 1 stop, 80 min
    expect(join([hostStop('x', 'X', '18:20', '19:10')]).bigChange).toBe(true) // 2 stops
    expect(join([hostStop('x', 'X', '14:00', '15:00')]).bigChange).toBe(true) // GBTB is 3 h
  })

  it('rule 6: kept stops keep their exact times', () => {
    const before = guestPlan()
    const r = join([hostStop('mbs', 'MBS', '20:45', '21:45')], { legs: before })
    for (const k of r.kept) {
      const orig = before.find((l) => l.place_id === k.place_id)
      const now = r.legs.find((l) => l.place_id === k.place_id)
      expect([now.arrive_iso, now.depart_iso]).toEqual([orig.arrive_iso, orig.depart_iso])
    }
  })

  it('stamped and skipped stops are never removed', () => {
    const legs = guestPlan()
    legs[1] = { ...legs[1], status: 'stamped' }
    const r = join([hostStop('x', 'X', '18:20', '19:10')], { legs })
    expect(names(r.removed)).toEqual(['Dinner Esplanade'])
    expect(r.legs.some((l) => l.name === 'Superpark')).toBe(true)
  })

  it('an own stop at the same place as a joined stop is removed', () => {
    const r = join([hostStop('superpark', 'Superpark with Mei', '13:00', '13:10')])
    expect(r.removed.map((x) => x.why)).toContain('same_place')
  })

  it('the input plan is not mutated', () => {
    const legs = guestPlan()
    const copy = JSON.parse(JSON.stringify(legs))
    join([hostStop('x', 'X', '18:20', '19:10')], { legs })
    expect(legs).toEqual(copy)
  })
})

describe('restoreOnLeave (rule 7)', () => {
  it('leaving early brings back removed stops that still fit', () => {
    const r = join([hostStop('x', 'Dinner with Mei', '18:20', '19:10')]) // removes Superpark + Dinner Esplanade
    const back = restoreOnLeave({ legs: r.legs, removed: r.removed, partyId: 'p1', nowMs: T('16:00') })
    expect(back.legs.some((l) => l.fixed)).toBe(false)
    expect(names(back.restored)).toEqual(['Superpark', 'Dinner Esplanade'])
    expect(back.legs.map((l) => l.name)).toEqual(['GBTB', 'Superpark', 'Dinner Esplanade', 'Drinks Paya Lebar', 'Changi Airport T3'])
  })

  it('stops that already started, or start within 15 min, do not come back', () => {
    const r = join([hostStop('x', 'Dinner with Mei', '18:20', '19:10')])
    const back = restoreOnLeave({ legs: r.legs, removed: r.removed, partyId: 'p1', nowMs: T('19:10') })
    expect(back.dropped.map((d) => [d.leg.name, d.why])).toEqual([['Superpark', 'past'], ['Dinner Esplanade', 'too_soon']])
    expect(names(back.restored)).toEqual([])
  })

  it('a removed stop that now overlaps something else stays removed', () => {
    const r = join([hostStop('x', 'Dinner with Mei', '18:20', '19:10')])
    const legs = [...r.legs, visit('new', 'Added later', '17:30', '18:00')] // guest added a stop meanwhile
    const back = restoreOnLeave({ legs, removed: r.removed, partyId: 'p1', nowMs: T('16:00') })
    expect(back.dropped.find((d) => d.leg.name === 'Superpark')?.why).toBe('overlap')
  })

  it('only the left party\'s blocks are dropped', () => {
    const r = join([hostStop('mbs', 'MBS', '20:45', '21:45')])
    const legs = [...r.legs, { ...hostStop('y', 'Other group', '14:00', '14:30'), fixed: true, party_id: 'p2' }]
    const back = restoreOnLeave({ legs, removed: [], partyId: 'p1', nowMs: T('12:00') })
    expect(back.legs.filter((l) => l.fixed).map((l) => l.party_id)).toEqual(['p2'])
  })
})
