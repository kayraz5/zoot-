import { readFileSync } from 'node:fs'
import { syncPlaces } from './_lib/places/index.js'
import { placesDbFromEnv, savePlaces } from './_lib/places/supabase.js'

/**
 * GET /api/sync-places — daily Vercel Cron (see vercel.json). Refreshes the Supabase
 * `places` table from the seed + OpenStreetMap. Needs CRON_SECRET, SUPABASE_SECRET_KEY
 * and supabase/places_sync.sql run once.
 */
// Overpass can take a minute when busy, plus Wikipedia lookups
export const config = { maxDuration: 300 }

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set' })
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const db = placesDbFromEnv()
  if (!db) return res.status(503).json({ error: 'SUPABASE_URL / SUPABASE_SECRET_KEY not set' })

  try {
    const seed = JSON.parse(readFileSync(new URL('../src/model/data/places.sg.json', import.meta.url), 'utf8'))
    const previous = await db.select('places', 'select=*')
    const { ok, report, places } = await syncPlaces({ seed, previous })
    if (!ok) return res.status(502).json({ error: 'OpenStreetMap failed, nothing written', report })

    await savePlaces(db, places)
    return res.status(200).json({ ok: true, report })
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) })
  }
}
