import * as THREE from 'three'
import { MercatorCoordinate } from 'maplibre-gl'
import { distanceM } from '../../model/services/travel.js'

/**
 * 3D stop pin: a low-poly gem on a pillar, rendered as a MapLibre custom layer
 * (so it shares the map's WebGL context and camera instead of living in a
 * separate canvas).
 *
 * Every pin is alive: it floats and slowly turns while it is just a stop on the
 * map, and switches to a brighter, faster "you're close" animation (a heartbeat
 * and an expanding sonar ring) as the traveller approaches. All of that lives in
 * this file — MapLibre calls onAdd() once and render() every frame; that is the
 * whole custom layer contract.
 *
 * See syncStopPins() for creating/removing pins and updatePinProximity() for
 * telling them how close the traveller is.
 */

// The geometry below is authored in tiny units (gem radius 0.55). This multiplier
// turns those units into a pin that reads clearly at street zoom.
const PIN_SCALE = 40

/** Distance (metres) at which a pin switches to its "close" animation. */
export const PIN_NEAR_M = 90

/** A stable phase per pin, so neighbouring pins do not bob in lockstep. */
function phaseFor(id) {
  let hash = 7
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ((hash % 1000) / 1000) * Math.PI * 2
}

export class PinLayer {
  constructor({ id, lng, lat }) {
    this.id = id
    this.lng = lng
    this.lat = lat
    this.phase = phaseFor(id)

    // Animation state.
    this.spawn = 0            // 0 → 1 entrance growth
    this.nearness = 0         // smoothed 0 (far) → 1 (close)
    this.targetNearness = 0
    this.lastFrame = 0

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

    // Sonar ring that only appears when the traveller is close; expanding and
    // fading it gives the pin a clear "you're nearly here" signal.
    const ping = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.035, 6, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    )
    ping.position.y = 2.75
    ping.visible = false

    const group = new THREE.Group()
    group.add(pillar, gem, halo, ping)
    group.scale.setScalar(0.001) // grows in on spawn
    this.scene.add(group)

    this.group = group
    this.gem = gem
    this.halo = halo
    this.ping = ping

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

  /** How close the traveller is: true starts the "close" animation. */
  setNear(near) {
    this.targetNearness = near ? 1 : 0
  }

  /** Advance the float / spin / heartbeat / sonar animation for this frame. */
  animate(dt, now) {
    const t = now / 1000

    // Entrance: grow from the ground when the pin first appears.
    this.spawn = Math.min(1, this.spawn + dt * 2.5)
    const grow = 1 - Math.pow(1 - this.spawn, 3)
    this.group.scale.setScalar(grow)

    // Ease between the idle and close animations instead of snapping.
    this.nearness += (this.targetNearness - this.nearness) * Math.min(1, dt * 5)
    const near = this.nearness

    // Idle: a gentle float. Close: faster and deeper.
    const bobSpeed = 1.6 + near * 2.6
    const bobHeight = 0.05 + near * 0.14
    const bob = Math.sin(t * bobSpeed + this.phase) * bobHeight

    this.gem.position.y = 2.75 + bob
    this.halo.position.y = 2.75 + bob
    this.ping.position.y = 2.75 + bob

    // The gem turns; the halo shimmers and sways. Both speed up near the pin.
    this.gem.rotation.y = t * (0.6 + near * 2.4) + this.phase
    this.halo.rotation.z = t * (0.5 + near * 2.0)
    this.halo.rotation.y = Math.sin(t * 0.8 + this.phase) * (0.2 + near * 0.3)

    // Warm glow on the halo (black at rest) as the traveller approaches.
    this.halo.material.emissive.setRGB(near * 0.55, near * 0.45, 0)

    // Heartbeat: a small scale pulse on the gem, strongest when close.
    const beat = 1 + near * 0.12 * (0.5 + 0.5 * Math.sin(t * 6 + this.phase))
    this.gem.scale.setScalar(beat)

    // Sonar ping: a ring that expands and fades on a loop while close.
    if (near > 0.01) {
      const cycle = (t * 0.9 + this.phase) % 1
      this.ping.visible = true
      this.ping.scale.setScalar(1 + cycle * 0.9)
      this.ping.material.opacity = near * (1 - cycle) * 0.7
      this.ping.rotation.z = this.halo.rotation.z
      this.ping.rotation.y = this.halo.rotation.y
    } else {
      this.ping.visible = false
    }
  }

  /** Per-frame draw: animate, then sync Three.js's camera to the MapLibre view. */
  render(gl, args) {
    if (!this.map || !this.baseTransform) return

    const now = performance.now()
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0
    this.lastFrame = now
    this.animate(dt, now)

    const projection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
    this.camera.projectionMatrix = projection.multiply(this.baseTransform)

    // The shared context's GL state was last set by MapLibre; reset it first.
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)

    // MapLibre only repaints when something changes; the pins move on their own,
    // so keep asking for the next frame.
    this.map.triggerRepaint()
  }

  /** Release GPU resources when the pin is removed from the map. */
  onRemove() {
    this.scene.traverse((object) => {
      if (!object.isMesh) return
      object.geometry.dispose()
      object.material.dispose()
    })
    this.renderer?.dispose()
    this.map = null
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

/**
 * Tell every pin whether the traveller is close enough for its "close"
 * animation. Call after creating pins and on every position change.
 *
 * @param {Map} pins
 * @param {{ lat: number, lng: number } | null} position
 * @param {number} nearMeters
 */
export function updatePinProximity(pins, position, nearMeters = PIN_NEAR_M) {
  for (const pin of pins.values()) {
    pin.setNear(Boolean(position) && distanceM(position, pin) <= nearMeters)
  }
}
