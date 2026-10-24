import { Marker } from 'maplibre-gl'
import destination from '@turf/destination'
import { point } from '@turf/helpers'

/**
 * MapLibre layers and DOM markers for the quest:
 *   - the route from the traveller through every pending stop and home, coloured
 *     by travel mode (the current leg is bold, later legs are faded)
 *   - the check-in ring around the next stop (pink outside, yellow inside)
 *   - numbered stop markers and the "you are here" marker
 *
 * All functions take the map as their first argument and keep no module state, so
 * the caller (3D_Map.vue) owns the collections and decides when to redraw.
 */

const EMPTY = { type: 'FeatureCollection', features: [] }

const THEME = {
  dark: { walk: '#f83878', mrt: '#ffcc00', taxi: '#ff4d00', casing: '#000000' },
  light: { walk: '#f83878', mrt: '#111111', taxi: '#ff4d00', casing: '#ffffff' }
}

export const FENCE = { out: '#f83878', in: '#ffcc00' }

/** Create the route and fence sources/layers, under the 3D buildings. */
export function addQuestLayers(map) {
  const beforeId = map.getLayer('building-3d') ? 'building-3d' : undefined
  map.addSource('zt-route', { type: 'geojson', data: EMPTY })
  map.addSource('zt-fence', { type: 'geojson', data: EMPTY })

  map.addLayer(
    {
      id: 'zt-fence-fill',
      type: 'fill',
      source: 'zt-fence',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 }
    },
    beforeId
  )
  map.addLayer(
    {
      id: 'zt-fence-line',
      type: 'line',
      source: 'zt-fence',
      paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.5] }
    },
    beforeId
  )
  map.addLayer(
    {
      id: 'zt-route-casing',
      type: 'line',
      source: 'zt-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 17, 14],
        'line-opacity': ['case', ['get', 'active'], 0.9, 0.45]
      }
    },
    beforeId
  )

  // Walking legs follow real streets (solid); MRT/taxi legs are as-the-crow-flies (dashed).
  const routeLine = {
    type: 'line',
    source: 'zt-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 8],
      'line-opacity': ['case', ['get', 'active'], 1, 0.55]
    }
  }
  map.addLayer(
    { ...routeLine, id: 'zt-route-walk', filter: ['==', ['get', 'mode'], 'walk'] },
    beforeId
  )
  map.addLayer(
    {
      ...routeLine,
      id: 'zt-route-ride',
      filter: ['!=', ['get', 'mode'], 'walk'],
      paint: { ...routeLine.paint, 'line-dasharray': [1.2, 1.4] }
    },
    beforeId
  )
}

/** Recolour the route for the dark "Zoot" map or the light "Simple" one. */
export function setQuestColors(map, isDark) {
  if (!map.getLayer('zt-route-walk')) return
  const colors = isDark ? THEME.dark : THEME.light
  map.setPaintProperty('zt-route-walk', 'line-color', colors.walk)
  map.setPaintProperty('zt-route-ride', 'line-color', ['match', ['get', 'mode'], 'mrt', colors.mrt, colors.taxi])
  map.setPaintProperty('zt-route-casing', 'line-color', colors.casing)
}

/**
 * Replace the route geometry.
 * @param {{ coords: number[][], mode: 'walk'|'mrt'|'taxi', active?: boolean }[]} segments
 */
export function setRoute(map, segments) {
  map.getSource('zt-route')?.setData({
    type: 'FeatureCollection',
    features: segments.map((segment) => ({
      type: 'Feature',
      properties: { mode: segment.mode, active: !!segment.active },
      geometry: { type: 'LineString', coordinates: segment.coords }
    }))
  })
}

/**
 * Draw a circular check-in fence.
 * @param {{lat:number,lng:number}|null} target  the next stop (null clears it)
 * @param {number} radiusMeters                  geofence radius
 * @param {boolean} isInside                     true once the traveller is inside
 */
export function setFence(map, target, radiusMeters, isInside) {
  const source = map.getSource('zt-fence')
  if (!source) return
  if (!target) {
    source.setData(EMPTY)
    return
  }

  // 49 points: the last point repeats the first to close the polygon cleanly.
  const ring = Array.from({ length: 49 }, (_, index) =>
    destination(point([target.lng, target.lat]), radiusMeters / 1000, (index * 360) / 48, {
      units: 'kilometers'
    }).geometry.coordinates
  )

  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { color: isInside ? FENCE.in : FENCE.out },
        geometry: { type: 'Polygon', coordinates: [ring] }
      }
    ]
  })
}

/**
 * Keep one flat marker per mission leg in sync: number, ✓ when stamped, home icon
 * for the return leg, highlighted while it is the next stop.
 *
 * @param {Map} markers  caller-owned map of legKey → marker record (mutated)
 * @param {object[]} legs
 * @param {object|null} nextLeg
 * @param {(leg: object) => void} onSelect
 */
export function syncStopMarkers(map, markers, legs, nextLeg, onSelect) {
  const keep = new Set()

  for (const leg of legs) {
    const key = `${leg.seq}:${leg.place_id || 'home'}`
    keep.add(key)

    let entry = markers.get(key)
    if (!entry) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'zt-stop-marker'
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelect(entry.leg)
      })
      entry = {
        marker: new Marker({ element }).setLngLat([leg.lng, leg.lat]).addTo(map),
        element,
        leg
      }
      markers.set(key, entry)
    }

    entry.leg = leg
    const isHome = leg.kind === 'return'
    entry.element.innerHTML = isHome
      ? '<i class="bi bi-house-door-fill"></i>'
      : leg.status === 'stamped'
        ? '<i class="bi bi-patch-check-fill"></i>'
        : String(leg.seq)
    entry.element.classList.toggle('next', leg === nextLeg)
    entry.element.classList.toggle('done', leg.status !== 'pending')
    entry.element.title = isHome ? `Back to ${leg.name}` : `${leg.seq}. ${leg.name}`
    entry.element.setAttribute('aria-label', entry.element.title)
  }

  for (const [key, entry] of markers) {
    if (keep.has(key)) continue
    entry.marker.remove()
    markers.delete(key)
  }
}

/** Create the flat "you are here" marker (the caller decides when to add it). */
export function createPlayerMarker() {
  const element = document.createElement('div')
  element.className = 'zt-player-marker'
  element.innerHTML = '<span class="pulse"></span><span class="core"><i class="bi bi-person-walking"></i></span>'
  return new Marker({ element })
}
