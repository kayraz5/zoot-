// pnpm sync:places -> refreshes src/model/data/places.synced.json from the seed + OpenStreetMap
// pnpm sync:places --db -> also writes them to the Supabase `places` table (same as the daily cron)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { loadEnv } from 'vite'
import { syncPlaces } from '../api/_lib/places/index.js'
import { placesDbFromEnv, savePlaces } from '../api/_lib/places/supabase.js'

const SEED_FILE = new URL('../src/model/data/places.sg.json', import.meta.url)
const OUT_FILE = new URL('../src/model/data/places.synced.json', import.meta.url)

Object.assign(process.env, { ...loadEnv('development', process.cwd(), ''), ...process.env })

// Check Supabase before the slow OpenStreetMap pull, so a missing key or column fails straight away
const db = process.argv.includes('--db') ? placesDbFromEnv() : null
if (process.argv.includes('--db')) {
  if (!db) {
    console.error('[sync-places] --db needs SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env')
    process.exit(1)
  }
  try {
    await db.select('places', 'select=id,source,blurb_source&limit=1')
  } catch (err) {
    console.error(`[sync-places] Supabase check failed (run supabase/places_sync.sql first?): ${err.message}`)
    process.exit(1)
  }
}

const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'))
const previous = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : []

const { ok, report, places } = await syncPlaces({ seed, previous })
if (!ok) {
  console.error('[sync-places] OpenStreetMap failed, places.synced.json left unchanged')
  process.exit(1)
}

writeFileSync(OUT_FILE, JSON.stringify(places, null, 2) + '\n')
console.log(`[sync-places] wrote ${report.total} places (${report.active} active)`, report.bySource)

if (db) {
  const saved = await savePlaces(db, places)
  console.log(`[sync-places] saved ${saved} places to Supabase`)
}
