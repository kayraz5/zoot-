/**
 * Public-transport route for a leg, in the shape the map draws and the step card reads:
 *   getTransitRoute(from, to) -> Promise<{ coords, parts, minutes, source } | null>
 *
 * 1. OneMap via /api/transit (real bus + MRT itineraries, changes included), when the
 *    server has keys. A 503 means "not configured" and stops us asking again this session.
 * 2. Otherwise our own routing: the MRT (mrtRoute.js) or a direct bus (busRoute.js),
 *    whichever is quicker door to door.
 * Never throws; null means nothing could be resolved and callers keep what they had.
 */
import { getMrtRoute } from './mrtRoute.js'
import { findDirectBus } from './busRoute.js'

const TIMEOUT_MS = 9000
let oneMapAvailable = true
const cache = new Map()

async function fromOneMap(from, to) {
  if (!oneMapAvailable) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('/api/transit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: [from.lng, from.lat], end: [to.lng, to.lat], endName: to.name }),
      signal: ctrl.signal
    })
    // 503 = no keys on the server; a non-JSON reply = no API at all (static preview).
    if (res.status === 503 || !res.headers.get('content-type')?.includes('json')) oneMapAvailable = false
    if (!res.ok || !oneMapAvailable) return null
    const json = await res.json()
    if (!json.parts?.length || json.parts.some((p) => p.coords.length < 2 && p.mode !== 'walk')) return null
    return { coords: json.parts.flatMap((p) => p.coords), parts: json.parts, minutes: json.minutes, source: 'onemap' }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fromLocal(from, to) {
  const [mrt, bus] = await Promise.all([getMrtRoute(from, to).catch(() => null), findDirectBus(from, to).catch(() => null)])
  // Prefer the train unless the bus saves real time: trains are easier for first-timers.
  const best = mrt && (!bus || mrt.minutes <= bus.minutes + 5) ? mrt : bus
  return best && { ...best, source: 'local' }
}

export function getTransitRoute(from, to) {
  const key = [from.lng, from.lat, to.lng, to.lat].map((n) => n.toFixed(4)).join(',')
  if (!cache.has(key)) {
    const job = fromOneMap(from, to).then((r) => r || fromLocal(from, to))
    cache.set(key, job)
    job.then((r) => { if (!r) cache.delete(key) })
  }
  return cache.get(key)
}

/** Live arrivals at a bus stop: [{ no, mins: [3, 11], load }] or null. */
export async function getBusArrivals(code) {
  try {
    const res = await fetch(`/api/bus-arrival?code=${encodeURIComponent(code)}`)
    if (!res.ok) return null
    return (await res.json()).services
  } catch {
    return null
  }
}
