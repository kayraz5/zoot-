import { decodePolyline } from '../src/model/services/polyline.js'

/**
 * POST /api/transit — door-to-door public transport (bus + MRT) via OneMap, Singapore's
 * official map service. Body: { start: [lng,lat], end: [lng,lat], atMs?: number }
 * Returns the quickest itinerary as { minutes, parts: [...] } in the same `parts` shape the
 * client builds locally (mrtRoute.js / busRoute.js), or 503 when OneMap isn't configured —
 * the client then falls back to its own MRT + direct-bus routing.
 *
 * Needs ONEMAP_EMAIL + ONEMAP_PASSWORD (free account: https://www.onemap.gov.sg/apidocs/register).
 * Tokens last 3 days; one is fetched on demand and reused while this instance is warm.
 */
const ONEMAP = 'https://www.onemap.gov.sg'
const TIMEOUT_MS = 9000
const MODE = { WALK: 'walk', BUS: 'bus', SUBWAY: 'mrt', TRAM: 'mrt', RAIL: 'mrt' }

let token = null // { value, expiresMs }

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal })
    if (!res.ok) throw Object.assign(new Error(`OneMap ${res.status}`), { status: res.status })
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function getToken() {
  if (token && token.expiresMs - Date.now() > 3600e3) return token.value
  const json = await fetchJson(`${ONEMAP}/api/auth/post/getToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ONEMAP_EMAIL, password: process.env.ONEMAP_PASSWORD })
  })
  token = { value: json.access_token, expiresMs: Number(json.expiry_timestamp) * 1000 || Date.now() + 2 * 86400e3 }
  return token.value
}

/** OneMap wants Singapore-local date and time: MM-DD-YYYY and HH:MM:SS. */
function sgDateTime(ms) {
  const d = new Date(ms + 8 * 3600e3).toISOString()
  return { date: `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`, time: d.slice(11, 19) }
}

const place = (p) => p && { name: p.name, code: p.stopCode || p.stopId?.split(':').pop() || null, lat: p.lat, lng: p.lon }

function toParts(itinerary, endName) {
  return itinerary.legs.map((leg, i, legs) => {
    const mode = MODE[leg.mode] || 'walk'
    const part = {
      mode,
      coords: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
      minutes: Math.max(1, Math.round((leg.duration || 0) / 60)),
      from: place(leg.from),
      to: place(leg.to)
    }
    if (mode === 'walk') {
      const nextMode = MODE[legs[i + 1]?.mode]
      part.to.kind = i === legs.length - 1 ? 'place' : nextMode === 'bus' ? 'bus-stop' : 'station'
      if (part.to.kind === 'place') part.to.name = endName || part.to.name
    } else {
      part.stops = (leg.intermediateStops?.length ?? 0) + 1
      part.towards = leg.headsign || null
      if (mode === 'bus') part.service = leg.routeShortName || leg.route
      else part.line = String(leg.route || leg.routeShortName || '').slice(0, 2).toUpperCase()
    }
    return part
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.ONEMAP_EMAIL || !process.env.ONEMAP_PASSWORD) {
    return res.status(503).json({ error: 'OneMap is not configured' })
  }
  const { start, end, atMs, endName } = req.body || {}
  if (!Array.isArray(start) || !Array.isArray(end)) return res.status(400).json({ error: 'start and end ([lng,lat]) required' })

  const { date, time } = sgDateTime(Number(atMs) || Date.now())
  const qs = new URLSearchParams({
    start: `${start[1]},${start[0]}`,
    end: `${end[1]},${end[0]}`,
    routeType: 'pt',
    date,
    time,
    mode: 'TRANSIT',
    maxWalkDistance: '1000',
    numItineraries: '3'
  })
  try {
    let json
    try {
      json = await fetchJson(`${ONEMAP}/api/public/routingsvc/route?${qs}`, { headers: { Authorization: await getToken() } })
    } catch (err) {
      if (err.status !== 401) throw err
      token = null // expired early: get a fresh one and retry once
      json = await fetchJson(`${ONEMAP}/api/public/routingsvc/route?${qs}`, { headers: { Authorization: await getToken() } })
    }
    const itineraries = json.plan?.itineraries || []
    if (!itineraries.length) return res.status(404).json({ error: 'no transit route' })
    const best = itineraries.reduce((a, b) => (b.duration < a.duration ? b : a))
    res.setHeader('Cache-Control', 's-maxage=300')
    return res.status(200).json({ minutes: Math.round(best.duration / 60), transfers: best.transfers ?? null, parts: toParts(best, endName) })
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) })
  }
}
