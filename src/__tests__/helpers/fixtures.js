import { ORIGINS } from '../../model/data/origins.js'
import { catalog } from '../../model/services/catalog.js'
import { at, T } from './index.js'

/** Build the default planner context used by service and store specs. */
export function ctx(overrides = {}) {
  return {
    origin: ORIGINS[0],
    startMs: T('10:00'),
    mustReturnMs: T('20:00'),
    catalog: catalog.value,
    style: 'budget',
    interests: ['hawker', 'gardens'],
    energy: 'med',
    maxWalk: 15,
    partySize: 1,
    ...overrides,
  }
}

/** Build a place-like point with optional catalog fields. */
export function placeAt(lat, lng, extra = {}) {
  return { lat, lng, ...extra }
}

/** Build the mission shape used by socialJoin.spec.js and related service specs. */
export function missionFixture(legs, arriveBy = '23:15') {
  return {
    id: 'm1',
    origin: ORIGINS[0],
    start_iso: at('12:00'),
    must_return_iso: at('23:59'),
    style: 'budget',
    buffers: { exit_min: 30, reentry_min: 30, safety_min: 15 },
    prefs: {},
    legs: [
      ...legs,
      {
        kind: 'return',
        status: 'pending',
        name: 'Back to Changi',
        arrive_by: at(arriveBy),
        arrive_iso: at('22:00'),
        depart_iso: at('22:00'),
      },
    ],
  }
}
