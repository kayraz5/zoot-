import { supabaseFromEnv } from './_lib/supabase.js'

/**
 * POST /api/route — real road geometry for a walk or taxi leg, via OpenRouteService.
 * Body: { start: [lng,lat], end: [lng,lat], profile: 'walk' | 'taxi' }
 *
 * This is the failover provider behind routing.js's primary OSRM calls (see
 * src/model/services/routing.js) — it only gets hit when the free OSRM routers are
 * down or slow. ORS_API_KEY stays server-only here; the old code had this same key
 * hardcoded in the client bundle, which is how it kept getting rate-limited by anyone
 * who opened devtools. Checks the shared route_cache table first (supabase/route_cache.sql)
 * so a repeat stop-pair never needs a live call at all.
 */
const ORS_PROFILE = { walk: 'foot-walking', taxi: 'driving-car' }
const TIMEOUT_MS = 8000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { start, end, profile } = req.body || {}
  if (!Array.isArray(start) || !Array.isArray(end) || !ORS_PROFILE[profile]) {
    return res.status(400).json({ error: 'start, end ([lng,lat]) and profile (walk|taxi) required' })
  }

  const db = supabaseFromEnv()
  const key = cacheKey(profile, start, end)

  if (db) {
    try {
      const rows = await db.select('route_cache', `id=eq.${encodeURIComponent(key)}&select=geometry`)
      if (rows?.[0]) return res.status(200).json(rows[0].geometry)
    } catch (err) {
      console.error('[api/route] cache read failed', err) // non-fatal — fall through to a live call
    }
  }

  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'ORS_API_KEY is not set' })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url = `https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[profile]}` +
      `?api_key=${apiKey}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: `ORS ${r.status}` })
    const data = await r.json()
    const feature = data.features?.[0]
    if (!feature?.geometry?.coordinates) return res.status(502).json({ error: 'ORS returned no route' })
    const result = { coords: feature.geometry.coordinates, distance_m: feature.properties?.segments?.[0]?.distance ?? null }

    if (db) {
      db.upsert('route_cache', [{
        id: key, profile, start_lng: start[0], start_lat: start[1], end_lng: end[0], end_lat: end[1],
        geometry: result, provider: 'ors'
      }]).catch((err) => console.error('[api/route] cache write failed', err)) // non-fatal
    }

    return res.status(200).json(result)
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) })
  } finally {
    clearTimeout(timer)
  }
}

/** Rounded to ~11 m so repeat queries for the same stop-pair always hit the same row. */
function cacheKey(profile, start, end) {
  const r = (n) => n.toFixed(4)
  return `${profile}:${r(start[0])},${r(start[1])};${r(end[0])},${r(end[1])}`
}
