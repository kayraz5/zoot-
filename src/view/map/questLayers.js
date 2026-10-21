import { Marker } from 'maplibre-gl'
import destination from '@turf/destination'
import { point } from '@turf/helpers'

/**
 * Everything the mission draws on the MapLibre map:
 *  - the quest path (traveller → every pending stop → home), coloured by travel mode,
 *    with the segment you're on now drawn bold and the rest faded
 *  - the check-in ring around the next stop (pink, turns yellow once you're inside it)
 *  - numbered stop markers and the "you" marker
 */

const EMPTY = { type: 'FeatureCollection', features: [] }
const THEME = {
  dark: { walk: '#f83878', mrt: '#ffcc00', taxi: '#ff4d00', casing: '#000000' },
  light: { walk: '#f83878', mrt: '#111111', taxi: '#ff4d00', casing: '#ffffff' }
}
export const FENCE = { out: '#f83878', in: '#ffcc00' }

export function addQuestLayers(map) {
  // Draw under the 3D buildings so the path reads as being on the street.
  const beforeId = map.getLayer('building-3d') ? 'building-3d' : undefined
  map.addSource('zt-route', { type: 'geojson', data: EMPTY })
  map.addSource('zt-fence', { type: 'geojson', data: EMPTY })

  map.addLayer({ id: 'zt-fence-fill', type: 'fill', source: 'zt-fence', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } }, beforeId)
  map.addLayer({ id: 'zt-fence-line', type: 'line', source: 'zt-fence', paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.5] } }, beforeId)
  map.addLayer({
    id: 'zt-route-casing', type: 'line', source: 'zt-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 17, 14], 'line-opacity': ['case', ['get', 'active'], 0.9, 0.45] }
  }, beforeId)
  // Walking legs follow real streets (solid); MRT/taxi legs are as-the-crow-flies (dashed).
  const line = {
    type: 'line', source: 'zt-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 8], 'line-opacity': ['case', ['get', 'active'], 1, 0.55] }
  }
  map.addLayer({ ...line, id: 'zt-route-walk', filter: ['==', ['get', 'mode'], 'walk'] }, beforeId)
  map.addLayer({ ...line, id: 'zt-route-ride', filter: ['!=', ['get', 'mode'], 'walk'], paint: { ...line.paint, 'line-dasharray': [1.2, 1.4] } }, beforeId)
}

/** Recolour the path for the dark "Zoot" map or the light "Simple" one. */
export function setQuestColors(map, dark) {
  if (!map.getLayer('zt-route-walk')) return
  const c = dark ? THEME.dark : THEME.light
  map.setPaintProperty('zt-route-walk', 'line-color', c.walk)
  map.setPaintProperty('zt-route-ride', 'line-color', ['match', ['get', 'mode'], 'mrt', c.mrt, c.taxi])
  map.setPaintProperty('zt-route-casing', 'line-color', c.casing)
}

/** segments: [{ coords: [[lng, lat]…], mode, active }] */
export function setRoute(map, segments) {
  map.getSource('zt-route')?.setData({
    type: 'FeatureCollection',
    features: segments.map((s) => ({ type: 'Feature', properties: { mode: s.mode, active: !!s.active }, geometry: { type: 'LineString', coordinates: s.coords } }))
  })
}

export function setFence(map, at, radiusM, inside) {
  const src = map.getSource('zt-fence')
  if (!src) return
  if (!at) return src.setData(EMPTY)
  const ring = Array.from({ length: 49 }, (_, i) => destination(point([at.lng, at.lat]), radiusM / 1000, (i * 360) / 48, { units: 'kilometers' }).geometry.coordinates)
  src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color: inside ? FENCE.in : FENCE.out }, geometry: { type: 'Polygon', coordinates: [ring] } }] })
}

/** Keeps one marker per mission leg in sync: number (or ✓ / home), next stop highlighted. */
export function syncStopMarkers(map, markers, legs, nextLeg, onSelect) {
  const keep = new Set()
  for (const leg of legs) {
    const key = `${leg.seq}:${leg.place_id || 'home'}`
    keep.add(key)
    let mk = markers.get(key)
    if (!mk) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'zt-stop-marker'
      el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(mk.leg) })
      mk = { marker: new Marker({ element: el }).setLngLat([leg.lng, leg.lat]).addTo(map), el, leg }
      markers.set(key, mk)
    }
    mk.leg = leg
    const home = leg.kind === 'return'
    mk.el.innerHTML = home ? '<i class="bi bi-house-door-fill"></i>' : leg.status === 'stamped' ? '<i class="bi bi-patch-check-fill"></i>' : String(leg.seq)
    mk.el.classList.toggle('next', leg === nextLeg)
    mk.el.classList.toggle('done', leg.status !== 'pending')
    mk.el.title = home ? `Back to ${leg.name}` : `${leg.seq}. ${leg.name}`
    mk.el.setAttribute('aria-label', mk.el.title)
  }
  for (const [key, mk] of markers) if (!keep.has(key)) { mk.marker.remove(); markers.delete(key) }
}

export function createPlayerMarker(map) {
  const el = document.createElement('div')
  el.className = 'zt-player-marker'
  el.innerHTML = '<span class="pulse"></span><span class="core"><i class="bi bi-person-walking"></i></span>'
  return new Marker({ element: el })
}

/** Straight line [from, to] as GeoJSON coords. */
export const straight = (a, b) => [[a.lng, a.lat], [b.lng, b.lat]]
