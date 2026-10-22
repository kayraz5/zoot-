import { fetchOsmPlaces, addWikipediaBlurbs } from './osm.js'
import { mergePlaces } from './merge.js'

/**
 * Pull OpenStreetMap and merge it with the seed. If OSM fails, nothing should be written.
 */
export async function syncPlaces({ seed, previous = [], log = console.log }) {
  const report = { osm: null, errors: [] }

  let osm = null
  try {
    osm = await fetchOsmPlaces()
    // Reuse last run's Wikipedia text so only new places hit Wikipedia
    const cachedBlurbs = new Map(previous.filter((p) => p.blurb_source === 'wikipedia').map((p) => [p.source_ref, p.blurb]))
    await addWikipediaBlurbs(osm, cachedBlurbs)
    report.osm = osm.length
  } catch (err) {
    report.errors.push(`OpenStreetMap: ${err.message}`)
  }

  report.errors.forEach((e) => log(`[sync-places] ${e}`))
  if (!osm) return { ok: false, report, places: null }

  const places = mergePlaces({ seed, osm, previous })
  report.total = places.length
  report.active = places.filter((p) => p.active !== false).length
  report.bySource = countBy(places, (p) => p.source)
  return { ok: true, report, places }
}

function countBy(list, key) {
  const counts = {}
  for (const item of list) counts[key(item)] = (counts[key(item)] || 0) + 1
  return counts
}
