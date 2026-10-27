/**
 * Basemap label styling for the 3D map.
 *
 * The Liberty basemap ships small, thin labels with a white halo, which vanish
 * against the dark Zoot palette. These helpers restyle every text layer for the
 * active map theme without reloading tiles: bolder type, larger street-level
 * sizes, and a halo that matches the map background.
 */

// The only font stacks OpenFreeMap serves glyphs for. Regular is a fallback for
// characters the bold face does not cover.
const LABEL_FONTS = {
  bold: ['Noto Sans Bold', 'Noto Sans Regular'],
  italic: ['Noto Sans Italic', 'Noto Sans Regular']
}

const LABEL_THEMES = {
  theme: {
    ink: '#fff4c2',
    poi: '#ffe680',
    road: '#fff4c2',
    water: '#a9dcff',
    halo: '#111111',
    haloWidth: 2.2
  },
  simple: {
    ink: '#171717',
    poi: '#4b4432',
    road: '#2b2b2b',
    water: '#2e5a80',
    halo: '#fffdf4',
    haloWidth: 1.8
  }
}

// Street-level type sizes. City/country headings keep the basemap's own sizes.
const LABEL_SIZES = {
  poi: ['interpolate', ['linear'], ['zoom'], 14, 12, 17, 14, 19, 15],
  road: ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 12.5, 18, 15],
  place: ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 12.5, 17, 14.5],
  water: ['interpolate', ['linear'], ['zoom'], 10, 13, 16, 15]
}

// Basemap layers that deserve the same readable "place name" treatment.
const PLACE_LAYERS = new Set(['airport', 'label_other', 'label_village', 'label_town'])

/**
 * Which typographic bucket a basemap symbol layer belongs to.
 * Returning null leaves the layer untouched (one-way arrows, road shields).
 */
function labelKind(layerId) {
  if (layerId.startsWith('water')) return 'water'
  if (layerId.startsWith('poi')) return 'poi'
  if (layerId.startsWith('highway-name')) return 'road'
  if (PLACE_LAYERS.has(layerId)) return 'place'
  // City/country/state headings: restyle weight and contrast, keep their size.
  if (layerId.startsWith('label_')) return 'heading'
  return null
}

/**
 * Restyle every basemap text layer for the active map theme.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} isDark  true for the Zoot dark palette, false for "Simple"
 */
export function applyMapLabelStyle(map, isDark) {
  if (!map?.isStyleLoaded()) return

  const theme = isDark ? LABEL_THEMES.theme : LABEL_THEMES.simple

  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue

    const kind = labelKind(layer.id)
    if (!kind) continue

    // "place" and "heading" have no own colour and fall back to the base ink.
    const color = theme[kind] ?? theme.ink
    const size = LABEL_SIZES[kind]

    map.setLayoutProperty(layer.id, 'text-font', kind === 'water' ? LABEL_FONTS.italic : LABEL_FONTS.bold)
    if (size) map.setLayoutProperty(layer.id, 'text-size', size)
    map.setPaintProperty(layer.id, 'text-color', color)
    map.setPaintProperty(layer.id, 'text-halo-color', theme.halo)
    map.setPaintProperty(layer.id, 'text-halo-width', theme.haloWidth)
    map.setPaintProperty(layer.id, 'text-halo-blur', 0)
  }
}
