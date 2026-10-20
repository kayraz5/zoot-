import { readFileSync } from 'node:fs'
import { syncPlaces } from './_lib/places/index.js'
import { nearestHub } from '../src/model/services/travel.js'

/**
 * GET /api/sync-places — daily Vercel Cron (see vercel.json). Refreshes the Supabase
 * `places` table from the seed + OpenStreetMap. Needs CRON_SECRET, SUPABASE_SECRET_KEY
 * and supabase/places_sync.sql run once.
 */
// Overpass can take a minute when busy, plus Wikipedia lookups
export const config = { maxDuration: 300 }

const COLUMNS = [
  'id', 'name', 'area', 'lat', 'lng', 'tags', 'duration_min', 'cost_band', 'indoor', 'mrt', 'hours',
  'closed_days', 'min_window_h', 'blurb', 'captions', 'safety_notes', 'image_url',
  'source', 'source_ref', 'active', 'hours_verified', 'website', 'blurb_source'
]

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set' })
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY // new sb_secret_ or legacy service_role
  if (!url || !key) return res.status(503).json({ error: 'SUPABASE_URL / SUPABASE_SECRET_KEY not set' })
  const db = supabaseRest(url, key)

  try {
    const seed = JSON.parse(readFileSync(new URL('../src/model/data/places.sg.json', import.meta.url), 'utf8'))
    const previous = await db.select('places', 'select=*')
    const { ok, report, places } = await syncPlaces({ seed, previous })
    if (!ok) return res.status(502).json({ error: 'OpenStreetMap failed, nothing written', report })

    const rows = places.map(toRow)
    for (let i = 0; i < rows.length; i += 200) await db.upsert('places', rows.slice(i, i + 200))
    return res.status(200).json({ ok: true, report })
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) })
  }
}

function toRow(place) {
  const row = {}
  for (const column of COLUMNS) row[column] = place[column] ?? null
  row.mrt ||= nearestHub(place).name
  row.hours ??= '24h'
  row.closed_days ??= []
  row.captions ??= []
  row.source ??= 'seed'
  row.active ??= true
  row.hours_verified ??= place.source === 'seed' || !place.source
  return row
}

// Tiny PostgREST client; the service role key bypasses RLS, so it only ever runs on the server
function supabaseRest(url, key) {
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only go in apikey
  const headers = { apikey: key, 'Content-Type': 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  const call = async (path, init) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init?.headers } })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
    return res.status === 204 ? null : res.json().catch(() => null)
  }
  return {
    select: (table, query) => call(`${table}?${query}`),
    upsert: (table, rows) => call(`${table}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    })
  }
}
