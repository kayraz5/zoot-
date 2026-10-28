/**
 * Building visibility for the 3D map.
 *
 * The basemap has two building layers:
 *   - `building`     flat footprints (stock zoom range 13–14)
 *   - `building-3d`  extruded buildings (zoom 14+)
 *
 * The map exposes two independent choices: whether buildings show at all, and
 * whether they are flat or extruded (see the Map appearance dialog).
 */

export const BUILDING_LAYERS = {
  flat: 'building',
  extruded: 'building-3d'
}

// Flat footprints stop at zoom 14 in the basemap. The quest map runs at street
// zoom (16–18), so extend the layer to keep flat buildings visible there.
const FLAT_ZOOM_RANGE = [13, 24]

/**
 * Apply the building choices to the basemap layers.
 *
 * The flat layer is kept visible with `fill-opacity: 0` instead of being hidden.
 * MapLibre only prepares overzoomed source features while a layer using them is
 * visible during tile loading; hiding it makes the flat style impossible to reveal
 * at street zoom later. Keeping it "warm" lets either style switch on instantly,
 * while the 3D layer can stay fully hidden whenever it is not in use.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {{ visible: boolean, extruded: boolean }} options
 */
export function applyBuildingLayers(map, { visible, extruded }) {
  if (!map) return

  if (map.getLayer(BUILDING_LAYERS.flat)) {
    map.setLayerZoomRange(BUILDING_LAYERS.flat, ...FLAT_ZOOM_RANGE)
    map.setLayoutProperty(BUILDING_LAYERS.flat, 'visibility', 'visible')
    map.setPaintProperty(BUILDING_LAYERS.flat, 'fill-opacity', visible && !extruded ? 1 : 0)
  }

  if (map.getLayer(BUILDING_LAYERS.extruded)) {
    map.setLayoutProperty(
      BUILDING_LAYERS.extruded,
      'visibility',
      visible && extruded ? 'visible' : 'none'
    )
  }
}
