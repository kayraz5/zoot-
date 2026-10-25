import * as THREE from 'three'
import { MercatorCoordinate } from 'maplibre-gl'

/**
 * 3D stop pin: a low-poly gem on a pillar, rendered as a MapLibre custom layer
 * (so it shares the map's WebGL context and camera instead of living in a
 * separate canvas).
 *
 * MapLibre calls onAdd() once and render() every frame; that is the whole custom
 * layer contract. See syncStopPins() at the bottom for keeping one pin per leg.
 */

// The geometry below is authored in tiny units (gem radius 0.55). This multiplier
// turns those units into a pin that reads clearly at street zoom.
const PIN_SCALE = 40

export class PinLayer {
  constructor({ id, lng, lat }) {
    this.id = id
    this.lng = lng
    this.lat = lat

    // Required by MapLibre to treat this as a custom WebGL layer.
    this.type = 'custom'
    this.renderingMode = '3d'
  }

  /** One-time setup: build the pin and the transform that places it on the map. */
  onAdd(map, gl) {
    this.map = map
    this.camera = new THREE.Camera()
    this.scene = new THREE.Scene()

    // Lambert material needs light; a hemisphere light gives the low-poly facets
    // their bright-top / shaded-bottom look.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9cc7a4, 2.2))

    const material = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true })

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.2, 6), material(0xffffff))
    pillar.position.y = 1.2 // lift the base to ground level

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), material(0xf83878))
    gem.position.y = 2.75 // sits on top of the pillar

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 24), material(0x000000))
    halo.position.y = 2.75 // rings the gem

    const group = new THREE.Group()
    group.add(pillar, gem, halo)
    this.scene.add(group)

    // Place the pin in MapLibre's Mercator space. meterInMercatorCoordinateUnits()
    // keeps it a consistent real-world size regardless of latitude.
    const position = MercatorCoordinate.fromLngLat([this.lng, this.lat], 0)
    const scale = position.meterInMercatorCoordinateUnits() * PIN_SCALE

    // local scene → map position, with Three.js's Y-up space rotated into the
    // map's Z-up space.
    this.baseTransform = new THREE.Matrix4()
      .makeTranslation(position.x, position.y, position.z)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))

    // Reuse the map's canvas/context so Three.js draws into the same frame.
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    // MapLibre has already drawn the map; clearing here would erase it.
    this.renderer.autoClear = false
  }

  /** Per-frame draw: sync Three.js's camera to the current MapLibre view. */
  render(gl, args) {
    const projection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
    this.camera.projectionMatrix = projection.multiply(this.baseTransform)

    // The shared context's GL state was last set by MapLibre; reset it first.
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
  }
}

/**
 * Keep one PinLayer per mission leg in sync with `legs` — the same
 * add-if-missing / remove-if-stale pattern as questLayers.js's syncStopMarkers(),
 * but for WebGL custom layers instead of DOM markers.
 *
 * @param {Map} pins  caller-owned Map(legKey → PinLayer), mutated in place
 * @param {object[]} legs
 */
export function syncStopPins(map, pins, legs) {
  const keep = new Set()

  for (const leg of legs) {
    const key = `${leg.seq}:${leg.place_id || 'home'}`
    keep.add(key)

    if (pins.has(key)) continue
    const pin = new PinLayer({ id: `pin-${key}`, lng: leg.lng, lat: leg.lat })
    map.addLayer(pin)
    pins.set(key, pin)
  }

  for (const [key, pin] of pins) {
    if (keep.has(key)) continue
    map.removeLayer(pin.id)
    pins.delete(key)
  }
}
