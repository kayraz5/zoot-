import { describe, it, expect } from 'vitest'
import { windowAfterEdit, openableStops, toWindowStop } from '../model/services/social.js'

const at = (hhmm) => `2026-10-21T${hhmm}:00+08:00`
const leg = (place_id, from, to, extra = {}) => ({ kind: 'visit', status: 'pending', place_id, name: place_id, arrive_iso: at(from), depart_iso: at(to), xp: 50, ...extra })
const mission = (legs) => ({ legs: [...legs, { kind: 'return', arrive_by: at('23:15') }] })
const quest = (legs) => ({ stops: legs.map((l, i) => ({ ...toWindowStop(l), seq: i + 1 })) })

describe('toWindowStop: what a guest may see', () => {
  it('keeps place, name, times and XP only (no travel notes that reveal the airport)', () => {
    const s = toWindowStop(leg('maxwell', '13:30', '14:15', { travel_detail: 'MRT Changi Airport → Chinatown', why: 'near T3', travel_mode: 'mrt' }))
    expect(Object.keys(s).sort()).toEqual(['arrive_iso', 'depart_iso', 'kind', 'name', 'place_id', 'xp'])
  })
})

describe('openableStops', () => {
  it('only my own upcoming visits starting 15+ min from now (not stamped, not joined blocks)', () => {
    const m = mission([
      leg('a', '13:00', '13:30', { status: 'stamped' }),
      leg('b', '14:05', '14:30'),
      leg('c', '14:20', '15:00'),
      leg('d', '15:10', '16:00', { fixed: true, party_id: 'p' })
    ])
    expect(openableStops(m, Date.parse(at('13:55'))).map((l) => l.place_id)).toEqual(['c'])
  })
})

describe('windowAfterEdit: keep what guests see in step with the host\'s plan', () => {
  const base = [leg('a', '13:00', '13:40'), leg('b', '14:00', '14:40'), leg('c', '15:00', '15:40'), leg('d', '16:00', '16:40')]
  const q = quest([base[1], base[2]]) // window = b, c

  it('no change → null (no network call)', () => {
    expect(windowAfterEdit(q, mission(base))).toBeNull()
  })

  it('stamping a window stop changes nothing guests see', () => {
    const legs = base.map((l) => (l.place_id === 'b' ? { ...l, status: 'stamped' } : l))
    expect(windowAfterEdit(q, mission(legs))).toBeNull()
  })

  it('a re-timed window stop is pushed', () => {
    const legs = base.map((l) => (l.place_id === 'c' ? { ...l, arrive_iso: at('15:20'), depart_iso: at('16:00') } : l))
    expect(windowAfterEdit(q, mission(legs)).map((l) => l.place_id)).toEqual(['b', 'c'])
  })

  it('a stop added inside the window joins the window', () => {
    const legs = [base[0], base[1], leg('x', '14:45', '14:55'), base[2], base[3]]
    expect(windowAfterEdit(q, mission(legs)).map((l) => l.place_id)).toEqual(['b', 'x', 'c'])
  })

  it('changes outside the window are ignored', () => {
    const legs = [base[0], base[1], base[2], leg('z', '16:00', '17:00')]
    expect(windowAfterEdit(q, mission(legs))).toBeNull()
  })

  it('a skipped or removed window stop drops out; all gone → empty (closes the quest)', () => {
    const skipped = base.map((l) => (l.place_id === 'b' ? { ...l, status: 'skipped' } : l))
    expect(windowAfterEdit(q, mission(skipped)).map((l) => l.place_id)).toEqual(['c'])
    expect(windowAfterEdit(q, mission([base[0], base[3]]))).toEqual([])
  })
})
