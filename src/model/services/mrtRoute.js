/**
 * Real-geometry MRT routing. An MRT leg is three real pieces stitched together — walk to
 * the nearest station, ride the actual track (sliced out of mrtLines.sg.json, one slice
 * per line-segment of the journey so transfers are handled correctly), walk from the
 * arrival station to the destination — never a straight line standing in for any of them.
 *
 * getMrtRoute(from, to) -> Promise<{ coords: [[lng,lat]…], parts, minutes, distance_m } | null>
 * Returns null (never throws) if any piece can't be resolved — the walk legs go through
 * routing.js's own provider-chain getWalkRoute(), and the ride itself fails closed if a
 * hub doesn't land near its line's geometry. The Sentosa Express has no real-geometry
 * source (see scripts/sync-mrt-lines.mjs), so its short monorail hops are drawn station to station.
 * Callers keep showing the last-known-good route on a null, same contract as
 * getWalkRoute()/getDriveRoute() — see refreshPlanned()/refreshLiveRoute() in MapView.vue.
 */
import mrtLines from '../data/mrtLines.sg.json'
import { HUBS, transit, distanceM, rideMinutes } from './travel.js'
import { getWalkRoute } from './routing.js'

const MAX_HUB_TO_TRACK_M = 300 // a hub coordinate that lands further than this from its own line's geometry is treated as a data mismatch, not a route

function nearestIndex(coords, p) {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < coords.length; i++) {
    // Squared degree-distance, just to pick the nearest vertex — Singapore's small enough
    // that latitude distortion doesn't change which point is nearest.
    const d = (coords[i][0] - p.lng) ** 2 + (coords[i][1] - p.lat) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

function pathLength(coords) {
  let m = 0
  for (let i = 1; i < coords.length; i++) {
    m += distanceM({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] })
  }
  return m
}

/** The line's geometry is stored as disjoint `parts` (branches/loops) — use whichever part actually passes near both hubs. */
function sliceLine(lineCode, fromHub, toHub) {
  const line = mrtLines[lineCode]
  if (!line) return null
  let best = null
  for (const part of line.parts) {
    const i = nearestIndex(part, fromHub)
    const j = nearestIndex(part, toHub)
    const di = distanceM({ lng: part[i][0], lat: part[i][1] }, fromHub)
    const dj = distanceM({ lng: part[j][0], lat: part[j][1] }, toHub)
    if (!best || di + dj < best.d) best = { part, i, j, d: di + dj }
  }
  if (!best || best.d / 2 > MAX_HUB_TO_TRACK_M) return null
  const { part, i, j } = best
  return i <= j ? part.slice(i, j + 1) : part.slice(j, i + 1).reverse()
}

/** The station exit closest to `p` (or the station itself when the dataset has no exits). */
function exitNear(hub, p) {
  let best = null
  for (const exit of hub.exits || []) {
    const d = distanceM(exit, p)
    if (!best || d < best.d) best = { ...exit, d }
  }
  return best ? { lat: best.lat, lng: best.lng, exit: best.name } : { lat: hub.lat, lng: hub.lng, exit: null }
}

const INDOOR_HOP_M = 300 // terminal ↔ station, platform ↔ exit: indoors, where street routers can't go

/**
 * Walking geometry between two points. Street routers can't see inside Changi's terminals
 * or stations, so for a short hop they either fail or detour around the outside (3 km for
 * T3 → Changi Airport MRT). There, and only there, a direct connector is the honest line.
 */
export async function walkLeg(a, b) {
  const route = await getWalkRoute(a, b)
  const straight = distanceM(a, b)
  if (straight <= INDOOR_HOP_M && (!route || route.distance_m > straight * 4 + 200)) {
    return { coords: [[a.lng, a.lat], [b.lng, b.lat]], distance_m: straight }
  }
  return route
}

const stop = (id) => ({ id, name: HUBS[id].name, code: HUBS[id].code, lat: HUBS[id].lat, lng: HUBS[id].lng })

/**
 * Also returns `parts`: one entry per thing the traveller does, in order, for the map
 * (each part drawn in its own style) and the step-by-step card (transitSteps.js):
 *   { mode: 'walk', coords, minutes, to: { name, kind: 'station'|'place', exit? } }
 *   { mode: 'mrt', coords, minutes, line, from, to, stops, towards, nextStop }
 */
export async function getMrtRoute(from, to) {
  const t = transit(from, to)
  if (!t) return null

  const startHub = HUBS[t.fromHub]
  const endHub = HUBS[t.toHub]
  const entrance = exitNear(startHub, from)
  const exit = exitNear(endHub, to)

  const [startWalk, endWalk] = await Promise.all([walkLeg(from, entrance), walkLeg(exit, to)])
  if (!startWalk || !endWalk) return null

  const parts = [{ mode: 'walk', coords: startWalk.coords, minutes: t.walkToHubMin, to: { ...stop(t.fromHub), kind: 'station', exit: entrance.exit } }]

  for (const run of t.runs) {
    const a = t.path.indexOf(run.from)
    const b = t.path.indexOf(run.to, a)
    const coords = []
    for (let i = a; i < b; i++) {
      const a = HUBS[t.path[i]]
      const b = HUBS[t.path[i + 1]]
      // The Sentosa Express monorail has no track dataset; it's short and nearly straight.
      const seg = t.edgeLines[i] === 'SE' ? [[a.lng, a.lat], [b.lng, b.lat]] : sliceLine(t.edgeLines[i], a, b)
      if (!seg) return null
      coords.push(...seg)
    }
    parts.push({
      mode: 'mrt',
      coords,
      minutes: rideMinutes(run.from, run.to)?.minutes ?? null,
      line: run.line,
      from: stop(run.from),
      to: stop(run.to),
      stops: run.stops,
      towards: run.towards && HUBS[run.towards].name,
      nextStop: HUBS[run.nextStop].name
    })
  }

  parts.push({ mode: 'walk', coords: endWalk.coords, minutes: t.walkFromHubMin, from: { ...stop(t.toHub), exit: exit.exit }, to: { name: to.name, kind: 'place', lat: to.lat, lng: to.lng } })

  const coords = parts.flatMap((p) => p.coords)
  return { coords, parts, minutes: t.minutes, distance_m: pathLength(coords) }
}
