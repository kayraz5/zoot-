import mrtLines from '../../../model/data/mrtLines.sg.json'
import network from '../../../model/data/mrtNetwork.sg.json'
import { LINES, BUS_HEX } from '../../../model/data/transitLines.js'
import { loadBusData, nearbyStops } from '../../../model/services/busRoute.js'
import { partColour } from '../../../model/services/transitSteps.js'

/**
 * Public transport on the map, so a first-time visitor can see where the trains and buses are:
 *   - every MRT line in its official colour, with station dots and names;
 *   - bus stops once you zoom to street level (tap one for live arrivals);
 *   - on the route itself, a pin where to board, change and get off.
 * The route line's colours per part come from routeFeatures() (walk pink, train in line colour).
 */
const FONT = ['Noto Sans Bold', 'Noto Sans Regular']
const SHOWN_LINES = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE'] // CG/CE are the same track as EW/CC in mrtLines
const BUS_STOP_RADIUS_M = 1500 // bus stops are loaded around the traveller, not all 5,000 at once

export const TRANSIT_LAYERS = ['transit-lines-casing', 'transit-lines', 'transit-stations', 'transit-station-labels', 'transit-bus-stops']
export const TAPPABLE_LAYERS = ['transit-stations', 'transit-bus-stops']
const POINT_SOURCE = 'mission-transit-points'

const THEMES = {
  dark: { ink: '#fff4c2', halo: '#111111', casing: '#111111', stationFill: '#ffffff' },
  light: { ink: '#1b1b1b', halo: '#fffdf4', casing: '#ffffff', stationFill: '#ffffff' }
}

function linesGeojson() {
  return {
    type: 'FeatureCollection',
    features: SHOWN_LINES.filter((code) => mrtLines[code]).map((code) => ({
      type: 'Feature',
      properties: { line: code, color: LINES[code].hex },
      geometry: { type: 'MultiLineString', coordinates: mrtLines[code].parts }
    }))
  }
}

function stationsGeojson() {
  return {
    type: 'FeatureCollection',
    features: Object.values(network.stations).map((s) => {
      const lines = [...new Set(s.codes.map((c) => c.slice(0, 2)))]
      return {
        type: 'Feature',
        properties: {
          kind: 'station',
          name: s.name,
          codes: s.codes.filter((c) => !/^[A-Z]{2}0$/.test(c)).join(' · '),
          lines: lines.join(','),
          color: LINES[lines[0]]?.hex || '#666666',
          interchange: lines.length > 1
        },
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] }
      }
    })
  }
}

/** Add the network layers under the basemap's labels. Call once the style has loaded. */
export function addTransitLayers(map, isDark) {
  if (map.getSource('transit-lines')) return
  const theme = isDark ? THEMES.dark : THEMES.light
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

  map.addSource('transit-lines', { type: 'geojson', data: linesGeojson() })
  map.addLayer({
    id: 'transit-lines-casing', type: 'line', source: 'transit-lines',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': theme.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4.5, 16, 12], 'line-opacity': 0.8 }
  }, firstLabel)
  map.addLayer({
    id: 'transit-lines', type: 'line', source: 'transit-lines',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 7.5], 'line-opacity': 0.95 }
  }, firstLabel)

  map.addSource('transit-stations', { type: 'geojson', data: stationsGeojson() })
  map.addLayer({
    id: 'transit-stations', type: 'circle', source: 'transit-stations',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['get', 'interchange'], 3.5, 2.5], 16, ['case', ['get', 'interchange'], 9, 7]],
      'circle-color': theme.stationFill,
      'circle-stroke-color': ['case', ['get', 'interchange'], '#111111', ['get', 'color']],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 3]
    }
  })
  map.addLayer({
    id: 'transit-station-labels', type: 'symbol', source: 'transit-stations', minzoom: 13,
    layout: {
      'text-field': ['format', ['get', 'name'], {}, '\n', {}, ['get', 'codes'], { 'font-scale': 0.75 }],
      'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 17, 14],
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-optional': true
    },
    paint: { 'text-color': theme.ink, 'text-halo-color': theme.halo, 'text-halo-width': 2 }
  })

  map.addSource('transit-bus-stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'transit-bus-stops', type: 'circle', source: 'transit-bus-stops', minzoom: 15,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3.5, 18, 8],
      'circle-color': BUS_HEX,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5
    }
  })

  map.addSource(POINT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'mission-transit-points', type: 'circle', source: POINT_SOURCE,
    paint: { 'circle-radius': 9, 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 4 }
  })
  map.addLayer({
    id: 'mission-transit-point-labels', type: 'symbol', source: POINT_SOURCE,
    layout: {
      'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 13,
      'text-offset': [0, -1.4], 'text-anchor': 'bottom', 'text-allow-overlap': true
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': ['get', 'color'], 'text-halo-width': 3 }
  })
}

/** Load the bus stops around `p` (the traveller); called as they move. */
export async function syncBusStops(map, p) {
  if (!p || !(await loadBusData()) || !map.getSource('transit-bus-stops')) return
  map.getSource('transit-bus-stops').setData({
    type: 'FeatureCollection',
    features: nearbyStops(p, BUS_STOP_RADIUS_M).map((s) => ({
      type: 'Feature',
      properties: { kind: 'bus', code: s.code, name: s.name, road: s.road, services: s.services.join(',') },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] }
    }))
  })
}

export function setTransitTheme(map, isDark) {
  if (!map.getLayer('transit-lines')) return
  const theme = isDark ? THEMES.dark : THEMES.light
  map.setPaintProperty('transit-lines-casing', 'line-color', theme.casing)
  map.setPaintProperty('transit-station-labels', 'text-color', theme.ink)
  map.setPaintProperty('transit-station-labels', 'text-halo-color', theme.halo)
}

export function setTransitVisible(map, visible) {
  for (const id of TRANSIT_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}

/** The pins where to board, change and get off, for the leg being travelled. */
export function setTransferPoints(map, points) {
  map.getSource(POINT_SOURCE)?.setData({
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      properties: { label: p.label, color: p.colour },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
    }))
  })
}

/** Route line features, one per part, carrying the colour to draw it in. */
export function routeFeatures(parts) {
  return parts
    .filter((part) => part.coords?.length > 1)
    .map((part) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: part.coords },
      properties: { mode: part.mode, color: partColour(part) }
    }))
}
