// pnpm sync:transit -> refreshes the public-transport data the map and router use:
//   src/model/data/mrtNetwork.sg.json  every MRT station (name, codes, position, exits) and the
//                                      station order of each line, from cheeaun/sgraildata.
//   public/data/bus.sg.json            every bus stop and service (stop sequence + road polyline
//                                      per direction), from cheeaun/busrouter's data.busrouter.sg.
// Both sources are community-maintained extracts of LTA DataMall + OpenStreetMap. This is an
// occasional run, not a live dependency: the bus file is fetched lazily from our own origin.
import { mkdirSync, writeFileSync } from 'node:fs'

const RAIL_URL = 'https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/v1/sg-rail.geojson'
const BUS_URL = 'https://data.busrouter.sg/v1'
const MRT_OUT = new URL('../src/model/data/mrtNetwork.sg.json', import.meta.url)
const BUS_OUT = new URL('../public/data/bus.sg.json', import.meta.url)

// MRT lines only; the LRT feeder loops (BP, SW, SE, PW, PE) aren't where layover travellers go.
const LINES = ['NS', 'EW', 'CG', 'NE', 'CC', 'DT', 'TE']
// Stations in the dataset that aren't carrying passengers yet. Add codes here if a future
// stage shows up before it opens; routing skips them so nobody is sent to a closed station.
const NOT_OPEN = []
// Track links that numeric order alone doesn't capture.
const EXTRA_LINKS = [
  ['CC', 'CC34', 'CC4'] // Bayfront ↔ Promenade closes the Circle Line loop
]

const get = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const round = (n) => Math.round(n * 1e5) / 1e5

// ── MRT ─────────────────────────────────────────────────────────────────────
const rail = await get(RAIL_URL)
const stations = {}
const byCode = {}
for (const f of rail.features) {
  const p = f.properties
  if (p.stop_type !== 'station' || !p.network.includes('mrt')) continue
  // "EW4-CG" is Tanah Merah: the Changi branch starts there, so treat it as CG0.
  const codes = [...p.station_codes.matchAll(/([A-Z]{2})(\d*)/g)]
    .map(([, line, n]) => line + (n || '0'))
    .filter((c) => LINES.includes(c.slice(0, 2)) && !NOT_OPEN.includes(c))
  if (!codes.length) continue
  const id = slug(p.name)
  const [lng, lat] = f.geometry.coordinates
  stations[id] = { name: p.name, codes, lat: round(lat), lng: round(lng), exits: [] }
  for (const c of codes) byCode[c] = id
}

for (const f of rail.features) {
  const p = f.properties
  if (p.stop_type !== 'entrance') continue
  const code = p.station_codes.match(/[A-Z]{2}\d+/)?.[0]
  const id = byCode[code]
  if (!id) continue
  const [lng, lat] = f.geometry.coordinates
  stations[id].exits.push({ name: p.name, lat: round(lat), lng: round(lng) })
}

const lines = {}
for (const line of LINES) {
  const codes = Object.keys(byCode)
    .filter((c) => c.slice(0, 2) === line)
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
  lines[line] = { stations: codes.map((c) => byCode[c]), links: [] }
}
for (const [line, a, b] of EXTRA_LINKS) {
  if (byCode[a] && byCode[b]) lines[line].links.push([byCode[a], byCode[b]])
}

writeFileSync(MRT_OUT, JSON.stringify({ source: RAIL_URL, lines, stations }) + '\n')
console.log(`MRT: ${Object.keys(stations).length} stations, ${LINES.length} lines -> ${MRT_OUT.pathname}`)

// ── Buses ───────────────────────────────────────────────────────────────────
const [stopsRaw, servicesRaw, routesRaw] = await Promise.all(
  ['stops', 'services', 'routes'].map((f) => get(`${BUS_URL}/${f}.min.json`))
)
const stops = {}
for (const [code, [lng, lat, name, road]] of Object.entries(stopsRaw)) stops[code] = [lng, lat, name, road, []]
const services = {}
for (const [no, { name, routes }] of Object.entries(servicesRaw)) {
  services[no] = { name, routes, lines: routesRaw[no] || [] } // lines = encoded polyline per direction
  for (const code of new Set(routes.flat())) stops[code]?.[4].push(no)
}

mkdirSync(new URL('.', BUS_OUT), { recursive: true })
writeFileSync(BUS_OUT, JSON.stringify({ source: BUS_URL, stops, services }))
console.log(`Bus: ${Object.keys(stops).length} stops, ${Object.keys(services).length} services -> ${BUS_OUT.pathname}`)
