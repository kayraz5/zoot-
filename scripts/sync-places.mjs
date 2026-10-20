// pnpm sync:places -> refreshes src/model/data/places.synced.json from the seed + OpenStreetMap
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { loadEnv } from 'vite'
import { syncPlaces } from '../api/_lib/places/index.js'

const SEED_FILE = new URL('../src/model/data/places.sg.json', import.meta.url)
const OUT_FILE = new URL('../src/model/data/places.synced.json', import.meta.url)

Object.assign(process.env, { ...loadEnv('development', process.cwd(), ''), ...process.env })

const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'))
const previous = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : []

const { ok, report, places } = await syncPlaces({ seed, previous })
if (!ok) {
  console.error('[sync-places] OpenStreetMap failed, places.synced.json left unchanged')
  process.exit(1)
}

writeFileSync(OUT_FILE, JSON.stringify(places, null, 2) + '\n')
console.log(`[sync-places] wrote ${report.total} places (${report.active} active)`, report.bySource)
