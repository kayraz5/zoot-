// pnpm sync:mrt-lines -> refreshes src/model/data/mrtLines.sg.json from cheeaun/sgraildata's
// sg-rail.geojson (community-maintained; built from LTA DataMall + OpenStreetMap). This is a
// one-off/occasional run, not a live dependency of the app — see src/model/services/mrtRoute.js
// for how the written file gets used to draw real track geometry for MRT legs.
//
// Overpass (the usual way to pull OSM transit-route relations directly) was unreachable when
// this was written, so this goes through sgraildata's already-built-and-reviewed extract instead.
import { writeFileSync } from 'node:fs'

const SOURCE_URL = 'https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/v1/sg-rail.geojson'
const OUT_FILE = new URL('../src/model/data/mrtLines.sg.json', import.meta.url)

// EDGES in travel.js labels some rides 'CG' (the Changi Airport branch) and 'CE' (the Circle
// Line extension to Marina Bay/Bayfront) — both are physically part of the East West / Circle
// Line tracks in this dataset, not separate named lines, so they alias to the same geometry.
const LINE_ALIASES = {
  'East West Line': ['EW', 'CG'],
  'North South Line': ['NS'],
  'North East Line': ['NE'],
  'Circle Line': ['CC', 'CE'],
  'Downtown Line': ['DT'],
  'Thomson-East Coast Line': ['TE']
}
// Sentosa Express ('SE' in travel.js) isn't part of the public MRT/LRT network this dataset
// covers (it's run separately, by Sentosa Leisure Group) — no real-geometry source found for
// it yet, so SE legs fall outside this file on purpose. mrtRoute.js needs to handle that gap.
const KNOWN_GAP_CODES = ['SE']

const res = await fetch(SOURCE_URL)
if (!res.ok) {
  console.error(`[sync-mrt-lines] fetch failed: ${res.status} ${res.statusText}`)
  process.exit(1)
}
const geo = await res.json()

const lines = {}
for (const f of geo.features) {
  if (f.geometry.type !== 'LineString' && f.geometry.type !== 'MultiLineString') continue
  const codes = LINE_ALIASES[f.properties.name]
  if (!codes) continue
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const code of codes) lines[code] = { name: f.properties.name, color: f.properties.line_color, parts }
}

const expected = Object.values(LINE_ALIASES).flat()
const missing = expected.filter((code) => !lines[code])
if (missing.length) console.warn(`[sync-mrt-lines] no geometry found for: ${missing.join(', ')} (expected all of: ${expected.join(', ')})`)
console.warn(`[sync-mrt-lines] known gap, no source yet: ${KNOWN_GAP_CODES.join(', ')}`)

writeFileSync(OUT_FILE, JSON.stringify(lines, null, 2) + '\n')
console.log(`[sync-mrt-lines] wrote ${Object.keys(lines).length} line codes to ${OUT_FILE.pathname}`)
