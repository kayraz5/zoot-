/**
 * Buses, without any API key. The stop list, each service's stop order and its road line
 * come from public/data/bus.sg.json (pnpm sync:transit), fetched once on first use.
 *
 * loadBusData()            -> Promise<data | null>
 * nearbyStops(p, radiusM)  -> [{ code, name, road, lat, lng, services, d }] closest first (needs data loaded)
 * findDirectBus(from, to)  -> Promise<{ coords, parts, minutes, distance_m } | null>
 *   One bus, no changes: walk to a stop, ride, walk on. Same `parts` shape as mrtRoute.js.
 */
import { distanceM, walkMinutes } from './travel.js'
import { walkLeg } from './mrtRoute.js'
import { decodePolyline } from './polyline.js'

const STOP_RADIUS_M = 450      // how far we'll ask someone to walk to or from a stop
const MAX_STOPS_EACH_END = 8
const BUS_WAIT_MIN = 6          // typical headway is 8–15 min, so wait about half
const BUS_KMH = 17              // average including stops and lights
const BUS_DETOUR = 1.25         // stop-to-stop straight lines undercount the road
// Peak-hour-only services a visitor can't count on: City Direct (6xx), expresses (…e),
// NightRider/late-night (NR…), and other lettered specials.
const EVERYDAY = (no) => !/^6\d\d$|e$|^[A-Z]/.test(no)

let data = null
let loading = null

export function loadBusData() {
  loading ||= fetch('/data/bus.sg.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (data = json))
    .catch(() => {
      loading = null // try again next time
      return null
    })
  return loading
}

export const busDataReady = () => Boolean(data)

function stopInfo(code) {
  const s = data?.stops[code]
  return s && { code, lng: s[0], lat: s[1], name: s[2], road: s[3], services: s[4] }
}

export function nearbyStops(p, radiusM = STOP_RADIUS_M) {
  if (!data) return []
  const out = []
  for (const code of Object.keys(data.stops)) {
    const s = data.stops[code]
    // Cheap box check first: ~0.005° ≈ 550 m.
    if (Math.abs(s[1] - p.lat) > radiusM / 111000 || Math.abs(s[0] - p.lng) > radiusM / 108000) continue
    const d = distanceM(p, { lat: s[1], lng: s[0] })
    if (d <= radiusM) out.push({ ...stopInfo(code), d })
  }
  return out.sort((a, b) => a.d - b.d)
}

/** The road line of a service direction between two stops (nearest vertices), or a stop-to-stop line. */
function rideLine(no, dir, codes) {
  const encoded = data.services[no].lines?.[dir]
  const stops = codes.map(stopInfo)
  const fallback = stops.map((s) => [s.lng, s.lat])
  if (!encoded) return fallback
  const line = decodePolyline(encoded)
  const nearest = (s) => {
    let best = 0
    let bestD = Infinity
    line.forEach(([lng, lat], i) => {
      const d = (lng - s.lng) ** 2 + (lat - s.lat) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }
  const i = nearest(stops[0])
  const j = nearest(stops.at(-1))
  return j > i ? line.slice(i, j + 1) : fallback
}

/** Cheapest single-bus ride between the stops near `from` and `to`, scored like travel.js scores the MRT. */
function bestDirect(from, to) {
  const starts = nearbyStops(from).slice(0, MAX_STOPS_EACH_END)
  const ends = new Map(nearbyStops(to).slice(0, MAX_STOPS_EACH_END).map((s) => [s.code, s]))
  if (!starts.length || !ends.size) return null

  let best = null
  for (const start of starts) {
    for (const no of start.services.filter(EVERYDAY)) {
      data.services[no].routes.forEach((route, dir) => {
        const i = route.indexOf(start.code)
        if (i < 0) return
        for (let j = i + 1; j < route.length; j++) {
          const end = ends.get(route[j])
          if (!end) continue
          const codes = route.slice(i, j + 1)
          let rideM = 0
          for (let k = 1; k < codes.length; k++) rideM += distanceM(stopInfo(codes[k - 1]), stopInfo(codes[k]))
          const rideMin = Math.round(((rideM * BUS_DETOUR) / 1000 / BUS_KMH) * 60)
          const walkA = walkMinutes(from, start)
          const walkB = walkMinutes(end, to)
          const minutes = walkA + BUS_WAIT_MIN + rideMin + walkB
          if (!best || minutes < best.minutes) best = { no, dir, codes, start, end, walkA, walkB, rideMin, minutes }
          break // the first matching stop on this route is the earliest place to get off
        }
      })
    }
  }
  return best
}

export async function findDirectBus(from, to) {
  if (!(await loadBusData())) return null
  const best = bestDirect(from, to)
  if (!best) return null

  const [walkA, walkB] = await Promise.all([walkLeg(from, best.start), walkLeg(best.end, to)])
  if (!walkA || !walkB) return null

  const { no, start, end } = best
  const route = data.services[no].routes[best.dir]
  const stop = (s) => ({ name: s.name, code: s.code, road: s.road, lat: s.lat, lng: s.lng })
  const parts = [
    { mode: 'walk', coords: walkA.coords, minutes: best.walkA, to: { ...stop(start), kind: 'bus-stop' } },
    {
      mode: 'bus',
      coords: rideLine(no, best.dir, best.codes),
      minutes: best.rideMin,
      service: no,
      from: stop(start),
      to: stop(end),
      stops: best.codes.length - 1,
      towards: stopInfo(route.at(-1))?.name ?? null
    },
    { mode: 'walk', coords: walkB.coords, minutes: best.walkB, from: stop(end), to: { name: to.name, kind: 'place', lat: to.lat, lng: to.lng } }
  ]
  const coords = parts.flatMap((p) => p.coords)
  return { coords, parts, minutes: best.minutes, distance_m: null }
}
