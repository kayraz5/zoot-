import { nearestHub } from '../../../src/model/services/travel.js'

// Writes synced places to the Supabase `places` table (used by the cron and `pnpm sync:places --db`)

const COLUMNS = [
  'id', 'name', 'area', 'lat', 'lng', 'tags', 'duration_min', 'cost_band', 'indoor', 'mrt', 'hours',
  'closed_days', 'min_window_h', 'blurb', 'captions', 'safety_notes', 'image_url',
  'source', 'source_ref', 'active', 'hours_verified', 'website', 'blurb_source'
]

/** Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY); null if missing. */
export function placesDbFromEnv(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY // new sb_secret_ or legacy service_role
  return url && key ? supabaseRest(url, key) : null
}

export async function savePlaces(db, places) {
  const rows = places.map(toRow)
  for (let i = 0; i < rows.length; i += 200) await db.upsert('places', rows.slice(i, i + 200))
  return rows.length
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
