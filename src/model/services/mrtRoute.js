/**
 * Real-geometry MRT routing. An MRT leg is three real pieces stitched together — walk to
 * the nearest station, ride the actual track (sliced out of mrtLines.sg.json, one slice
 * per line-segment of the journey so transfers are handled correctly), walk from the
 * arrival station to the destination — never a straight line standing in for any of them.
 *
 * getMrtRoute(from, to) -> Promise<{ coords: [[lng,lat]…], distance_m } | null>
 * Returns null (never throws) if any piece can't be resolved — the walk legs go through
 * routing.js's own provider-chain getWalkRoute(), and the ride itself fails closed if a
 * hub doesn't land near its line's geometry or (known gap) the ride needs the Sentosa
 * Express line, which has no real-geometry source yet (see scripts/sync-mrt-lines.mjs).
 * Callers keep showing the last-known-good route on a null, same contract as
 * getWalkRoute()/getDriveRoute() — see refreshPlanned()/refreshLiveRoute() in MapView.vue.
 */
import mrtLines from '../data/mrtLines.sg.json'
import { HUBS, transit, distanceM } from './travel.js'
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

export async function getMrtRoute(from, to) {
  const t = transit(from, to)
  if (!t) return null

  const pieces = []

  const startHub = HUBS[t.fromHub]
  const startWalk = await getWalkRoute(from, startHub)
  if (!startWalk) return null
  pieces.push(startWalk.coords)

  for (let i = 0; i < t.edgeLines.length; i++) {
    const seg = sliceLine(t.edgeLines[i], HUBS[t.path[i]], HUBS[t.path[i + 1]])
    if (!seg) return null
    pieces.push(seg)
  }

  const endHub = HUBS[t.toHub]
  const endWalk = await getWalkRoute(endHub, to)
  if (!endWalk) return null
  pieces.push(endWalk.coords)

  const coords = pieces.flat()
  return { coords, distance_m: pathLength(coords) }
}
