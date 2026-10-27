// pnpm sync:places -> runs the places sync locally and refreshes src/model/data/places.synced.json (the app's offline copy)
// pnpm sync:places --db -> also writes them to the Supabase `places` table (same as the daily cron)
// Hand-picked places (source = 'seed') are read from Supabase, so .env needs SUPABASE_URL and SUPABASE_SECRET_KEY.
import { writeFileSync } from 'node:fs'
import { loadEnv } from 'vite'
import { syncPlaces } from '../api/_lib/places/index.js'
import { placesDbFromEnv, savePlaces } from '../api/_lib/places/supabase.js'

const OUT_FILE = new URL('../src/model/data/places.synced.json', import.meta.url)

Object.assign(process.env, { ...loadEnv('development', process.cwd(), ''), ...process.env })

// Check Supabase before the slow OpenStreetMap pull, so a missing key or column fails straight away
const db = placesDbFromEnv()
if (!db) {
  console.error('[sync-places] needs SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env')
  process.exit(1)
}
let previous
try {
  previous = await db.select('places', 'select=*')
} catch (err) {
  console.error(`[sync-places] Supabase check failed (run supabase/places_sync.sql first?): ${err.message}`)
  process.exit(1)
}
const seed = previous.filter((place) => place.source === 'seed')
if (!seed.length) {
  console.error('[sync-places] no hand-picked places (source = seed) in Supabase, nothing written')
  process.exit(1)
}

const { ok, report, places } = await syncPlaces({ seed, previous })
if (!ok) {
  console.error('[sync-places] OpenStreetMap failed, places.synced.json left unchanged')
  process.exit(1)
}

writeFileSync(OUT_FILE, JSON.stringify(places, null, 2) + '\n')
console.log(`[sync-places] wrote ${report.total} places (${report.active} active)`, report.bySource)

if (process.argv.includes('--db')) {
  const saved = await savePlaces(db, places)
  console.log(`[sync-places] saved ${saved} places to Supabase`)
}
