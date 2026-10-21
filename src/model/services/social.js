import { getDb } from './db/index.js'
import { travel } from './travel.js'
import { formatTime } from './hours.js'
import { resolveJoin } from './joinResolver.js'

/**
 * Social quests (docs/social-quests-spec.md), stored in the "parties" tables of supabase/social.sql.
 * A host opens ONE window of consecutive stops; guests join part of it. Supabase only: guest mode
 * has no server, so nobody else could see the window.
 * The database enforces the rules; this file calls it and reshapes rows for the views.
 */

export class GuestModeError extends Error {
  constructor() {
    super('Social quests need an email account. Guest mode keeps everything on this phone, so nobody else can see your stops.')
    this.name = 'GuestModeError'
  }
}

async function sb() {
  const db = await getDb()
  if (db.kind !== 'supabase') throw new GuestModeError()
  return db.client
}

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

async function myId(client) {
  const { data } = await client.auth.getSession()
  return data.session?.user?.id || null
}

// ── Browsing ─────────────────────────────────────────────────────────────

/** Open windows that haven't ended, each with "who's going" (host first, with joined stop ranges). */
export async function listOpenQuests() {
  const client = await sb()
  const quests = must(await client.from('parties').select('*').in('status', ['open', 'full'])
    .gt('ends_at', new Date().toISOString()).order('starts_at').limit(30))
  const rosters = await Promise.all(quests.map((q) => client.rpc('quest_roster', { p_party: q.id }).then(must)))
  return quests.map((q, i) => ({ ...q, roster: rosters[i] }))
}

/** One window + roster + my own member row (if I've joined). */
export async function getQuest(id) {
  const client = await sb()
  const quest = must(await client.from('parties').select('*').eq('id', id).maybeSingle())
  if (!quest) return null
  const me = await myId(client)
  const [roster, mine] = await Promise.all([
    client.rpc('quest_roster', { p_party: id }).then(must),
    client.from('party_members').select('*').eq('party_id', id).eq('user_id', me).maybeSingle().then(must)
  ])
  return { ...quest, roster, mine }
}

// ── Hosting ──────────────────────────────────────────────────────────────

/** My open window for this mission (not closed, not over), or null. */
export async function getHostedWindow(missionId) {
  const client = await sb()
  const me = await myId(client)
  const quest = must(await client.from('parties').select('*').eq('host_id', me).eq('mission_id', missionId)
    .neq('status', 'closed').gt('ends_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle())
  if (!quest) return null
  return { ...quest, roster: must(await client.rpc('quest_roster', { p_party: quest.id })) }
}

/** Stops a host can open: their own upcoming visits (not ones joined from someone else), starting 15+ min from now. */
export function openableStops(mission, nowMs = Date.now()) {
  return (mission?.legs || []).filter((l) => l.kind === 'visit' && l.status === 'pending' && !l.fixed && Date.parse(l.arrive_iso) > nowMs + 15 * 60000)
}

/**
 * Only what guests may see of a stop. The database rebuilds stops from an allow-list too
 * (normalize_window in social.sql), so this is belt and braces: travel notes like
 * "MRT Changi Airport → …" would reveal the host's airport.
 */
export function toWindowStop(leg) {
  return { kind: 'visit', place_id: leg.place_id, name: leg.name, arrive_iso: leg.arrive_iso, depart_iso: leg.depart_iso, xp: leg.xp }
}

export async function publishWindow({ mission, stops, capacity, note }) {
  const client = await sb()
  const me = await myId(client)
  return must(await client.from('parties').insert({
    host_id: me,
    mission_id: mission.id,
    title: mission.title.slice(0, 120),
    style: mission.style,
    capacity,
    note: note?.trim() || null,
    starts_at: stops[0].arrive_iso,        // the database recomputes these from the stops
    meeting_place_id: stops[0].place_id,
    stops: stops.map(toWindowStop)
  }).select().single())
}

/** Returns { removed: [user ids], window_version } (guests whose joined stops changed go back to their own plan). */
export async function updateWindow(id, stops) {
  const client = await sb()
  return must(await client.rpc('update_window', { p_party: id, p_stops: stops.map(toWindowStop) }))
}

export async function closeWindow(id) {
  const client = await sb()
  must(await client.rpc('close_window', { p_party: id }))
}

export async function deleteQuest(id) {
  const client = await sb()
  must(await client.rpc('delete_quest', { p_party: id }))
}

/**
 * After the host edits their plan: the window's new stops, or null if nothing guests can see changed.
 * The window keeps covering the same stretch of the itinerary: from the first to the last of its
 * stops that are still in the plan, including anything the host added in between.
 * Skipped stops drop out; stamped ones stay (stamping doesn't change times).
 */
export function windowAfterEdit(quest, mission) {
  const ids = new Set(quest.stops.map((s) => s.place_id))
  const visits = mission.legs.filter((l) => l.kind === 'visit' && !l.fixed && l.status !== 'skipped')
  const first = visits.findIndex((l) => ids.has(l.place_id))
  const last = visits.findLastIndex((l) => ids.has(l.place_id))
  const next = first < 0 ? [] : visits.slice(first, last + 1)
  const key = (list) => list.map((s) => `${s.place_id}@${Date.parse(s.arrive_iso)}-${Date.parse(s.depart_iso)}`).join('|')
  return key(next) === key(quest.stops) ? null : next
}

// ── Dev: drive the seeded fake travellers (dev_simulate in social.sql) ───
let demoIds = null
export async function demoUserIds() {
  if (demoIds) return demoIds
  const client = await sb()
  demoIds = new Set(must(await client.from('demo_users').select('user_id')).map((r) => r.user_id))
  return demoIds
}
export async function devSimulate(questId, action) {
  const client = await sb()
  return must(await client.rpc('dev_simulate', { p_party: questId, p_action: action }))
}

// ── Does it fit MY layover? ──────────────────────────────────────────────

/** My strict back-at-airport time: the mission's return leg arrive_by (gate time minus re-entry and safety buffers). */
export function airportBy(mission) {
  const ret = mission?.legs?.find((l) => l.kind === 'return')
  return Date.parse(ret?.arrive_by)
}

/**
 * Can I do these stops (a whole window or part of it) and still make my flight?
 * Ends + real travel back to MY airport must be by my airport time, and the first stop must start
 * after I'm out of the airport. Same rule the database checks in join_window().
 */
export function stopsFit(stops, mission, nowMs = Date.now()) {
  const by = airportBy(mission)
  if (!mission || !Number.isFinite(by) || by < nowMs) {
    return { ok: false, code: 'no_mission', reason: 'Plan your layover first so we can check it fits.' }
  }
  const last = stops.at(-1)
  const back = travel(last, mission.origin, { maxWalk: mission.prefs?.maxWalk, style: mission.style, atMs: Date.parse(last.depart_iso) })
  const endMs = Date.parse(last.depart_iso)
  const backAt = endMs + back.minutes * 60000
  const outAt = Date.parse(mission.start_iso) + (mission.buffers?.exit_min || 0) * 60000
  const base = { airportBy: by, backMin: back.minutes, backAt, spareMin: Math.round((by - backAt) / 60000) }
  if (backAt > by) {
    return { ...base, ok: false, code: 'too_late', reason: 'Ends after your return-by',
      detail: `Ends ${formatTime(endMs)}, then ${back.minutes} min back to ${mission.origin.label}: you'd arrive ${formatTime(backAt)}, but you must be back by ${formatTime(by)}.` }
  }
  if (Date.parse(stops[0].arrive_iso) < outAt) {
    return { ...base, ok: false, code: 'too_early', reason: 'Starts before you land',
      detail: `Starts ${formatTime(stops[0].arrive_iso)}, but you're only out of ${mission.origin.label} around ${formatTime(outAt)}.` }
  }
  return { ...base, ok: true, reason: 'Fits your window', detail: `Back at ${mission.origin.label} by ${formatTime(backAt)}, ${base.spareMin} min to spare.` }
}

// ── Joining (guest) ──────────────────────────────────────────────────────

/**
 * Which of a window's stops I can pick: from the first one that starts after I'm out of the airport
 * (and hasn't started yet) to the last one I can end on and still make my flight.
 * Returns { minFrom, maxTo } (1-based); minFrom > maxTo means none fit.
 */
export function joinableRange(stops, mission, nowMs = Date.now()) {
  const outAt = Date.parse(mission?.start_iso) + (mission?.buffers?.exit_min || 0) * 60000
  const earliest = Math.max(nowMs, Number.isFinite(outAt) ? outAt : nowMs)
  let minFrom = stops.findIndex((s) => Date.parse(s.arrive_iso) >= earliest) + 1
  if (minFrom === 0) minFrom = stops.length + 1
  let maxTo = 0
  stops.forEach((s, i) => {
    if (stopsFit(stops.slice(0, i + 1), mission, nowMs).code !== 'too_late') maxTo = i + 1
  })
  return { minFrom, maxTo }
}

/**
 * The guest's plan after joining stops from..to of a quest, without saving anything:
 * resolveJoin's rules (fixed blocks, removals, flight check) with the real travel estimate home.
 */
export function previewJoin(quest, from, to, mission) {
  const host = quest.roster?.find((m) => m.role === 'host')
  const joinStops = quest.stops.slice(from - 1, to)
  const fit = stopsFit(joinStops, mission)
  const res = resolveJoin({
    legs: mission.legs, joinStops, hostName: host?.display_name || 'the host', partyId: quest.id,
    airportByMs: airportBy(mission), backMin: fit.backMin
  })
  if (!res.ok && fit.detail) res.reason = `${res.reason}: ${fit.detail}`
  return { ...res, fit, joinStops, hostName: host?.display_name || 'the host' }
}

/**
 * Fill in how to get to each stop (mode, minutes, "MRT … → …") from the one before, WITHOUT moving
 * any times: after a join or leave the neighbours change, so the old travel notes are wrong.
 * The return leg's arrival (back at the airport) follows the last stop.
 */
export function withTravel(legs, mission) {
  const opts = { maxWalk: mission.prefs?.maxWalk, style: mission.style }
  let cur = mission.origin
  let t = Date.parse(mission.start_iso) + (mission.buffers?.exit_min || 0) * 60000
  return legs.map((l) => {
    if (l.kind === 'visit' && l.status === 'skipped') return l
    const tr = travel(cur, l.kind === 'return' ? mission.origin : l, { ...opts, atMs: t })
    const next = { ...l, travel_mode: tr.mode, travel_min: tr.minutes }
    // A joined stop says who you meet there; everything else gets the route.
    if (!l.fixed) next.travel_detail = tr.detail
    if (l.kind === 'return') {
      const home = new Date(t + tr.minutes * 60000).toISOString()
      Object.assign(next, { arrive_iso: home, depart_iso: home })
    } else {
      cur = l
      t = Date.parse(l.depart_iso)
    }
    return next
  })
}

/** Join stops from..to. The database re-checks capacity, range and my airport time. */
export async function joinWindow({ quest, from, to, mission }) {
  const client = await sb()
  const fit = stopsFit(quest.stops.slice(from - 1, to), mission)
  return must(await client.rpc('join_window', {
    p_party: quest.id, p_from: from, p_to: to,
    p_airport_by: new Date(airportBy(mission)).toISOString(), p_back_min: fit.backMin ?? 0
  }))
}

export async function leaveWindow(id) {
  const client = await sb()
  must(await client.rpc('leave_window', { p_party: id }))
}
