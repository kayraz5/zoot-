import { nearestHub } from '../../../src/model/services/travel.js'
import { supabaseFromEnv } from '../supabase.js'

// Writes synced places to the Supabase `places` table (used by the cron and `pnpm sync:places --db`)

const COLUMNS = [
  'id', 'name', 'area', 'lat', 'lng', 'tags', 'duration_min', 'cost_band', 'indoor', 'mrt', 'hours',
  'closed_days', 'min_window_h', 'blurb', 'captions', 'safety_notes', 'image_url',
  'source', 'source_ref', 'active', 'hours_verified', 'website', 'blurb_source'
]

/** Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY); null if missing. */
export const placesDbFromEnv = supabaseFromEnv

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
