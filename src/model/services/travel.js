import distance from '@turf/distance'
import { point } from '@turf/helpers'
import network from '../data/mrtNetwork.sg.json'
import { LINES } from '../data/transitLines.js'

/**
 * Travel-time model. Groq never produces minutes; this file does.
 *   walk  = Turf great-circle distance × 1.3 detour ÷ 80 m/min
 *   mrt   = walk to nearest hub + 4 min wait + graph ride (+4 min per line change) + walk from hub
 *   taxi  = distance × 1.35 ÷ 28 km/h + 6 min pickup (only when no MRT hub is walkable)
 * The MRT graph is the whole network (mrtNetwork.sg.json), so the nearest station is real.
 */

export const WALK_M_PER_MIN = 80
const DETOUR = 1.3
const MRT_WAIT_MIN = 4
const TRANSFER_MIN = 4
const MAX_HUB_WALK_MIN = 15
export const MRT_THRESHOLD_MIN = 18
// Trains run roughly 05:30–23:30 SGT (last trains vary by line); outside that we plan a taxi.
const MRT_OPEN_MIN = 5 * 60 + 30
const MRT_CLOSE_MIN = 23 * 60 + 30

export function mrtRunning(ms) {
  if (ms == null) return true
  const d = new Date(ms + 8 * 3600e3)
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  return m >= MRT_OPEN_MIN && m < MRT_CLOSE_MIN
}

const pt = (p) => point([p.lng, p.lat])

export function distanceM(a, b) {
  return distance(pt(a), pt(b), { units: 'kilometers' }) * 1000
}

// Every MRT station (pnpm sync:transit), keyed by a name slug: `changi_airport`, `city_hall`…
// The Sentosa Express isn't in that dataset, so its two island stops are added by hand.
export const HUBS = {}
for (const [id, s] of Object.entries(network.stations)) {
  HUBS[id] = { name: s.name, code: s.codes.filter((c) => !/^[A-Z]{2}0$/.test(c)).join('/'), lat: s.lat, lng: s.lng, exits: s.exits }
}
HUBS.rws = { name: 'Resorts World (Sentosa Express)', code: 'SE2', lat: 1.2557, lng: 103.8210, exits: [] }
HUBS.beach = { name: 'Beach (Sentosa Express)', code: 'SE3', lat: 1.2535, lng: 103.8174, exits: [] }

/** Ride time between neighbouring stations: track ≈ 1.15 × straight line at 55 km/h, plus a 30 s stop. */
const hopMinutes = (a, b) => (distanceM(HUBS[a], HUBS[b]) * 1.15) / (55000 / 60) + 0.5

// [from, to, ride minutes, line]: consecutive stations along each line, plus loop links.
const EDGES = []
for (const [line, { stations, links }] of Object.entries(network.lines)) {
  for (let i = 1; i < stations.length; i++) EDGES.push([stations[i - 1], stations[i], hopMinutes(stations[i - 1], stations[i]), line])
  for (const [a, b] of links) EDGES.push([a, b, hopMinutes(a, b), line])
}
EDGES.push(['harbourfront', 'rws', 5, 'SE'], ['rws', 'beach', 3, 'SE'])

const ADJ = {}
for (const [a, b, t, line] of EDGES) {
  ;(ADJ[a] ||= []).push({ to: b, t, line })
  ;(ADJ[b] ||= []).push({ to: a, t, line })
}

const rideCache = new Map()

/**
 * Shortest ride between hubs with a transfer penalty. Dijkstra over (hub, line) states.
 * `path` (hub ids visited, start to end) and `edgeLines` (the line each hop in `path` rode)
 * exist so mrtRoute.js can slice real track geometry per line-segment of a multi-transfer
 * ride — `lines` alone only gives the deduped set of lines used, not where each one starts
 * and ends along the path, which is what the slicer needs.
 */
export function rideMinutes(fromHub, toHub) {
  if (fromHub === toHub) return { minutes: 0, lines: [], path: [fromHub], edgeLines: [] }
  const key = fromHub + '>' + toHub
  if (rideCache.has(key)) return rideCache.get(key)
  const best = new Map()
  const queue = [{ node: fromHub, line: null, cost: 0, lines: [], path: [fromHub], edgeLines: [] }]
  let result = null
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost)
    const cur = queue.shift()
    const stateKey = cur.node + '|' + cur.line
    if (best.has(stateKey) && best.get(stateKey) <= cur.cost) continue
    best.set(stateKey, cur.cost)
    if (cur.node === toHub) { result = { minutes: Math.round(cur.cost), lines: cur.lines, path: cur.path, edgeLines: cur.edgeLines }; break }
    for (const e of ADJ[cur.node] || []) {
      const change = cur.line && cur.line !== e.line ? TRANSFER_MIN : 0
      const lines = cur.line === e.line ? cur.lines : [...cur.lines, e.line]
      queue.push({ node: e.to, line: e.line, cost: cur.cost + e.t + change, lines, path: [...cur.path, e.to], edgeLines: [...cur.edgeLines, e.line] })
    }
  }
  rideCache.set(key, result)
  return result
}


export function walkMinutes(a, b) {
  return Math.max(1, Math.round((distanceM(a, b) * DETOUR) / WALK_M_PER_MIN))
}

export function nearestHub(p) {
  let best = null
  for (const [id, h] of Object.entries(HUBS)) {
    const d = distanceM(p, h)
    if (!best || d < best.d) best = { id, d, hub: h }
  }
  return { id: best.id, ...best.hub, walk_min: Math.max(1, Math.round((best.d * DETOUR) / WALK_M_PER_MIN)) }
}

/** Exported so mrtRoute.js can get at the hub ids + per-hop line sequence, not just the minutes. */
export function transit(a, b) {
  const ha = nearestHub(a)
  const hb = nearestHub(b)
  if (ha.id === hb.id) return null
  if (ha.walk_min > MAX_HUB_WALK_MIN || hb.walk_min > MAX_HUB_WALK_MIN) return null
  const ride = rideMinutes(ha.id, hb.id)
  if (!ride) return null
  return {
    minutes: ha.walk_min + MRT_WAIT_MIN + ride.minutes + hb.walk_min,
    from: ha.name,
    to: hb.name,
    fromHub: ha.id,
    toHub: hb.id,
    walkMin: ha.walk_min + hb.walk_min,
    walkToHubMin: ha.walk_min,
    walkFromHubMin: hb.walk_min,
    waitMin: MRT_WAIT_MIN,
    lines: ride.lines,
    path: ride.path,
    edgeLines: ride.edgeLines,
    runs: rideRuns(ride)
  }
}

/** Line position of a station, for working out which way a train is heading. */
function lineIndex(line, hub) {
  return network.lines[line]?.stations.indexOf(hub) ?? -1
}

/**
 * Group a ride into one run per train: [{ line, from, to, stops, towards, nextStop }] (hub ids).
 * `towards` is the terminus shown on platform signs; loop lines (Circle) have none, so
 * `nextStop` is what to look for instead.
 */
export function rideRuns(ride) {
  const runs = []
  ride.edgeLines.forEach((line, i) => {
    const last = runs.at(-1)
    if (last?.line === line) {
      last.to = ride.path[i + 1]
      last.stops++
    } else {
      runs.push({ line, from: ride.path[i], to: ride.path[i + 1], nextStop: ride.path[i + 1], stops: 1 })
    }
  })
  for (const run of runs) {
    const stations = network.lines[run.line]?.stations
    const a = lineIndex(run.line, run.from)
    const b = lineIndex(run.line, run.nextStop)
    run.towards = stations && !LINES[run.line]?.loop && a >= 0 && b >= 0 ? (b > a ? stations.at(-1) : stations[0]) : null
  }
  return runs
}

/** ['CG', 'EW', 'NS'] -> "Green → Red line": what travellers see on signs, not line codes. */
function lineColours(lines) {
  const colours = lines.map((l) => LINES[l]?.colour || l).filter((c, i, all) => c !== all[i - 1])
  return `${colours.join(' → ')} line`
}

/** Door-to-door taxi/Grab estimate: detoured road distance at 28 km/h plus pickup. */
export function taxiMinutes(a, b) {
  return Math.round(((distanceM(a, b) * 1.35) / 1000 / 28) * 60 + 6)
}

/**
 * Pick a travel mode between two {lat,lng} points.
 * @param {{maxWalk?: number, style?: string, atMs?: number}} opts  atMs = departure time (MRT closes at night)
 * @returns {{mode:'walk'|'mrt'|'taxi', minutes:number, walk_min:number, distance_m:number, detail:string}}
 */
export function travel(a, b, opts = {}) {
  const maxWalk = Math.min(opts.maxWalk ?? MRT_THRESHOLD_MIN, MRT_THRESHOLD_MIN)
  const walk = walkMinutes(a, b)
  const distance_m = Math.round(distanceM(a, b))
  const onFoot = { mode: 'walk', minutes: walk, walk_min: walk, distance_m, detail: `${distance_m} m on foot` }
  if (walk <= maxWalk) return onFoot

  const t = mrtRunning(opts.atMs) ? transit(a, b) : null
  const taxi = taxiMinutes(a, b)
  const byMrt = t && { mode: 'mrt', minutes: t.minutes, walk_min: walk, distance_m, detail: `MRT ${t.from} → ${t.to} · ${lineColours(t.lines)}` }
  const byTaxi = (why) => ({ mode: 'taxi', minutes: taxi, walk_min: walk, distance_m, detail: `Taxi / Grab · ${why}` })
  // Budget travellers ride the MRT; others take a cab when it saves 20+ min.
  const mrtOrTaxi = () => (opts.style !== 'budget' && taxi + 20 < t.minutes ? byTaxi(`saves ${t.minutes - taxi} min vs MRT`) : byMrt)

  // Over the walking limit: take the train if it is roughly as quick as walking.
  if (t && t.minutes <= walk + 8) return mrtOrTaxi()
  // MRT is much slower (awkward transfers) and the walk is still sane: walk it.
  if (walk <= 30) return onFoot
  if (t) return mrtOrTaxi()
  return byTaxi(mrtRunning(opts.atMs) ? 'no MRT nearby' : 'MRT closed at this hour')
}
