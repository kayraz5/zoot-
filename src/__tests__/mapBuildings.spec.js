import { describe, expect, it, vi } from 'vitest'
import { applyBuildingLayers, BUILDING_LAYERS } from '../view/features/map/mapBuildings.js'

function fakeMap() {
  return {
    getLayer: vi.fn(() => ({ id: 'layer' })),
    setLayerZoomRange: vi.fn(),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn()
  }
}

describe('applyBuildingLayers', () => {
  it('keeps flat buildings warm but invisible when buildings are off', () => {
    const map = fakeMap()

    applyBuildingLayers(map, { visible: false, extruded: false })

    expect(map.setLayerZoomRange).toHaveBeenCalledWith(BUILDING_LAYERS.flat, 13, 24)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(BUILDING_LAYERS.flat, 'visibility', 'visible')
    expect(map.setPaintProperty).toHaveBeenCalledWith(BUILDING_LAYERS.flat, 'fill-opacity', 0)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(BUILDING_LAYERS.extruded, 'visibility', 'none')
  })

  it('shows flat footprints when buildings are on without 3D', () => {
    const map = fakeMap()

    applyBuildingLayers(map, { visible: true, extruded: false })

    expect(map.setPaintProperty).toHaveBeenCalledWith(BUILDING_LAYERS.flat, 'fill-opacity', 1)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(BUILDING_LAYERS.extruded, 'visibility', 'none')
  })

  it('shows extruded buildings and hides the flat fill when 3D is on', () => {
    const map = fakeMap()

    applyBuildingLayers(map, { visible: true, extruded: true })

    expect(map.setPaintProperty).toHaveBeenCalledWith(BUILDING_LAYERS.flat, 'fill-opacity', 0)
    expect(map.setLayoutProperty).toHaveBeenCalledWith(BUILDING_LAYERS.extruded, 'visibility', 'visible')
  })

  it('does nothing when the map or its building layers are missing', () => {
    expect(() => applyBuildingLayers(null, { visible: true, extruded: true })).not.toThrow()

    const map = fakeMap()
    map.getLayer.mockReturnValue(undefined)
    expect(() => applyBuildingLayers(map, { visible: true, extruded: true })).not.toThrow()
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})
