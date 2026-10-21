/**
 * Join resolution: what happens to a guest's own itinerary when they join part of someone's window.
 * Pure functions (no store, no network), so they're unit-tested in src/__tests__/joinResolver.spec.js
 * against the worked examples in docs/social-quests-spec.md.
 *
 * Rules, applied once, in order. Nothing is ever moved to a new time; own stops are only removed.
 *   1. The joined stops become fixed-time blocks tagged "with <host>".
 *   2. Remove own stops that overlap the joined block (first joined arrive → last joined depart).
 *   3. Remove the nearest remaining own stop on each side if its gap to the block is under 15 min.
 *   4. Refuse the join if the block's end + real travel back to the airport is after the airport time.
 *   5. Flag a big change (2+ stops removed, or any stop of 2+ hours) so the confirm sheet warns in red.
 *   6. Times of kept stops never change.
 *   7. On leaving, removed stops come back only if they still pass the overlap and gap checks.
 * Also: an own stop at the same place as a joined stop is removed (you visit it with the group,
 * and stamps are one per place per day anyway).
 */

export const GAP_MIN = 15
export const BIG_STOP_MIN = 120

const ms = (iso) => Date.parse(iso)
const minutesBetween = (a, b) => Math.round((b - a) / 60000)
const stayOf = (leg) => minutesBetween(ms(leg.arrive_iso), ms(leg.depart_iso))
const isOwnPending = (leg) => leg.kind === 'visit' && leg.status === 'pending' && !leg.fixed
const overlaps = (leg, start, end) => ms(leg.arrive_iso) < end && ms(leg.depart_iso) > start
/** Minutes between a leg and the span [start, end] (0 if they overlap). */
function gapMinutes(leg, start, end) {
  if (ms(leg.depart_iso) <= start) return minutesBetween(ms(leg.depart_iso), start)
  if (ms(leg.arrive_iso) >= end) return minutesBetween(end, ms(leg.arrive_iso))
  return 0
}

/** Visits in time order, return leg last, seq renumbered 1..n. Times are left exactly as they are. */
function ordered(legs) {
  const visits = legs.filter((l) => l.kind !== 'return').sort((a, b) => ms(a.arrive_iso) - ms(b.arrive_iso))
  const ret = legs.filter((l) => l.kind === 'return')
  return [...visits, ...ret].map((l, i) => ({ ...l, seq: i + 1 }))
}

/**
 * @param {object}   args
 * @param {object[]} args.legs        the guest's current mission legs
 * @param {object[]} args.joinStops   the chosen window stops (consecutive, in order)
 * @param {string}   args.hostName
 * @param {string}   args.partyId
 * @param {number}   args.airportByMs the guest's strict back-at-airport time (return leg arrive_by)
 * @param {number}   args.backMin     real travel minutes from the last joined stop back to the guest's airport
 * @returns {{ ok: boolean, reason: string|null, legs: object[], removed: object[], kept: object[], blocks: object[], bigChange: boolean }}
 *   removed: [{ leg, why: 'overlap' | 'gap' | 'same_place', gapMin? }]
 */
export function resolveJoin({ legs, joinStops, hostName, partyId, airportByMs, backMin }) {
  if (!joinStops?.length) return refuse('Pick at least one stop to join.')
  const start = ms(joinStops[0].arrive_iso)
  const end = ms(joinStops.at(-1).depart_iso)

  // Rule 4: strict airport time, real travel estimate.
  const backAt = end + Math.max(0, backMin || 0) * 60000
  if (!Number.isFinite(airportByMs) || backAt > airportByMs) {
    return refuse('Ends too late for your flight', { backAtMs: backAt })
  }

  // Rule 1: fixed blocks.
  const blocks = joinStops.map((s) => ({
    ...s,
    kind: 'visit',
    status: 'pending',
    fixed: true,
    party_id: partyId,
    with_host: hostName,
    why: `With ${hostName}`,
    travel_detail: `Meet ${hostName} at ${s.name}`
  }))
  const joinedPlaces = new Set(joinStops.map((s) => s.place_id))

  const removed = []
  const own = legs.filter(isOwnPending)

  // Rule 2 (+ same place).
  for (const leg of own) {
    if (overlaps(leg, start, end)) removed.push({ leg, why: 'overlap' })
    else if (joinedPlaces.has(leg.place_id)) removed.push({ leg, why: 'same_place' })
  }

  // Rule 3: the nearest remaining own stop on each side, if it's too tight.
  const gone = new Set(removed.map((r) => r.leg))
  const left = own.filter((l) => !gone.has(l))
  const before = left.filter((l) => ms(l.depart_iso) <= start).sort((a, b) => ms(b.depart_iso) - ms(a.depart_iso))[0]
  const after = left.filter((l) => ms(l.arrive_iso) >= end).sort((a, b) => ms(a.arrive_iso) - ms(b.arrive_iso))[0]
  if (before) {
    const gap = minutesBetween(ms(before.depart_iso), start)
    if (gap < GAP_MIN) removed.push({ leg: before, why: 'gap', gapMin: gap })
  }
  if (after) {
    const gap = minutesBetween(end, ms(after.arrive_iso))
    if (gap < GAP_MIN) removed.push({ leg: after, why: 'gap', gapMin: gap })
  }

  // Rule 6: everything else stays exactly where it was.
  const removedSet = new Set(removed.map((r) => r.leg))
  const kept = own.filter((l) => !removedSet.has(l))
  const nextLegs = ordered([...legs.filter((l) => !removedSet.has(l)), ...blocks])

  // Rule 5.
  const bigChange = removed.length >= 2 || removed.some((r) => stayOf(r.leg) >= BIG_STOP_MIN)

  return { ok: true, reason: null, legs: nextLegs, removed, kept, blocks: nextLegs.filter((l) => l.fixed && l.party_id === partyId), bigChange, backAtMs: backAt }
}

function refuse(reason, extra = {}) {
  return { ok: false, reason, legs: null, removed: [], kept: [], blocks: [], bigChange: false, ...extra }
}

/**
 * Rule 7: leaving a window ("Go solo", the window ending, or the host changing my stops).
 * Drops that party's fixed blocks, then brings back each removed own stop only if:
 *   - it hasn't started yet (nowMs),
 *   - it doesn't overlap anything still in the plan,
 *   - it's at least 15 min from any remaining fixed block, and starts 15+ min after now
 *     (you're coming from wherever the group left you).
 * @returns {{ legs: object[], restored: object[], dropped: { leg: object, why: string }[] }}
 */
export function restoreOnLeave({ legs, removed, partyId, nowMs }) {
  let plan = legs.filter((l) => !(l.fixed && l.party_id === partyId))
  const restored = []
  const dropped = []
  const candidates = [...(removed || [])].map((r) => r.leg || r).sort((a, b) => ms(a.arrive_iso) - ms(b.arrive_iso))

  for (const leg of candidates) {
    const a = ms(leg.arrive_iso)
    const d = ms(leg.depart_iso)
    if (a < nowMs + GAP_MIN * 60000) { dropped.push({ leg, why: a < nowMs ? 'past' : 'too_soon' }); continue }
    if (plan.some((l) => l.kind === 'visit' && overlaps(l, a, d))) { dropped.push({ leg, why: 'overlap' }); continue }
    if (plan.some((l) => l.fixed && gapMinutes(l, a, d) < GAP_MIN)) {
      dropped.push({ leg, why: 'gap' })
      continue
    }
    if (plan.some((l) => l.place_id === leg.place_id && l.kind === 'visit')) { dropped.push({ leg, why: 'same_place' }); continue }
    plan.push({ ...leg, status: 'pending' })
    restored.push(leg)
  }
  return { legs: ordered(plan), restored, dropped }
}
