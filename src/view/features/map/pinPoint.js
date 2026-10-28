import * as THREE from 'three'
import { MercatorCoordinate } from 'maplibre-gl'
import { distanceM } from '../../model/services/travel.js'
import { BRAND } from '../../model/services/brand.js'

/**
 * 3D stop pin: a low-poly gem on a pillar, rendered as a MapLibre custom layer
 * (so it shares the map's WebGL context and camera instead of living in a
 * separate canvas).
 *
 * Every pin is alive: it floats and slowly turns while it is just a stop on the
 * map, and switches to a brighter, faster "you're close" animation (a heartbeat
 * and an expanding sonar ring) as the traveller approaches. A camera-facing badge
 * shows the stop's sequence number, a glowing halo makes the pins easy to spot
 * from a distance, and the next stop glows brighter than the rest.
 *
 * MapLibre calls onAdd() once and render() every frame; that is the whole custom
 * layer contract. See syncStopPins() for creating/removing pins and
 * updatePinProximity() for telling them how close the traveller is.
 */

// The geometry below is authored in tiny units (gem radius 0.55). This multiplier
// turns those units into a pin that reads clearly at street zoom.
const PIN_SCALE = 40

/** Distance (metres) at which a pin switches to its "close" animation. */
export const PIN_NEAR_M = 90

// Shared shapes/positions, in pin units, used by both setup and animation.
const PIN_CREAM = '#fff4c2'
const PIN_TOP_Y = 2.75
const BADGE_Y = 4.1
const BADGE_SCALE = 1.05
const BADGE_RENDER_ORDER = 20

const BADGE_HOME = 'home'
export const LANDMARK_BADGE = 'landmark'

const BADGE = {
  size: 160,
  padding: 7,
  border: 10,
  font: '800 84px Poppins, "Noto Sans", system-ui, sans-serif',
  nextFill: BRAND.yellow,
  idleFill: PIN_CREAM,
  ink: BRAND.ink
}

// The glow is a lighter pink than the gem so the additive halo reads as light.
const GLOW_COLOR = 0xff3d9a
const GROUND_RING_COLOR = 0xff2d9a

// One soft halo texture is shared by every pin; badge textures are per-pin
// because each carries a different sequence number.
let sharedGlowTexture = null

/**
 * Billboard halo around the gem. The centre is transparent so the low-poly gem
 * stays crisp and the glow reads as a ring of light around it.
 */
function pinGlowTexture() {
  if (sharedGlowTexture) return sharedGlowTexture

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.16, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.34, 'rgba(255, 255, 255, 0.9)')
  gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.32)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  sharedGlowTexture = new THREE.CanvasTexture(canvas)
  sharedGlowTexture.colorSpace = THREE.SRGBColorSpace
  sharedGlowTexture.minFilter = THREE.LinearFilter
  sharedGlowTexture.magFilter = THREE.LinearFilter
  sharedGlowTexture.generateMipmaps = false
  return sharedGlowTexture
}

/** Simple house glyph for the "back home" leg, drawn inside the number badge. */
function drawHomeGlyph(ctx, cx, cy) {
  ctx.fillStyle = BADGE.ink
  ctx.beginPath()
  ctx.moveTo(cx, cy - 38)
  ctx.lineTo(cx + 42, cy - 2)
  ctx.lineTo(cx + 30, cy - 2)
  ctx.lineTo(cx + 30, cy + 34)
  ctx.lineTo(cx - 30, cy + 34)
  ctx.lineTo(cx - 30, cy - 2)
  ctx.lineTo(cx - 42, cy - 2)
  ctx.closePath()
  ctx.fill()
}

/** Star glyph for landmark pins that are not part of the numbered itinerary. */
function drawStarGlyph(ctx, cx, cy) {
  ctx.fillStyle = BADGE.ink
  ctx.beginPath()
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? 42 : 18
    const angle = -Math.PI / 2 + (point * Math.PI) / 5
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (point === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

/**
 * Round badge with the stop's sequence number, drawn to a canvas and used as an
 * always-camera-facing sprite. This is what makes a pin legible as "stop 3 of
 * the tour" from a distance instead of just another floating gem.
 */
function badgeTexture(label, isNext) {
  const { size } = BADGE
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2

  ctx.beginPath()
  ctx.arc(c, c, c - BADGE.padding, 0, Math.PI * 2)
  ctx.fillStyle = isNext ? BADGE.nextFill : BADGE.idleFill
  ctx.fill()
  ctx.lineWidth = BADGE.border
  ctx.strokeStyle = BADGE.ink
  ctx.stroke()

  if (label === BADGE_HOME) {
    drawHomeGlyph(ctx, c, c)
  } else if (label === LANDMARK_BADGE) {
    drawStarGlyph(ctx, c, c)
  } else {
    ctx.fillStyle = BADGE.ink
    ctx.font = BADGE.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, c, c + 5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

/** A stable phase per pin, so neighbouring pins do not bob in lockstep. */
function phaseFor(id) {
  let hash = 7
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ((hash % 1000) / 1000) * Math.PI * 2
}

export class PinLayer {
  constructor({ id, lng, lat, label = '', isNext = false }) {
    this.id = id
    this.lng = lng
    this.lat = lat
    this.badgeLabel = label    // sequence number ("1", "2", …), "home" or "landmark"
    this.isNext = isNext       // the stop the traveller is heading to now
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

    const material = (color, emissive = 0x000000, emissiveIntensity = 0) =>
      new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true })

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.2, 6), material(PIN_CREAM))
    pillar.position.y = 1.2 // lift the base to ground level

    // The gem glows pink on its own (emissive), so it stays vivid against the dark
    // map even when no light is hitting its shaded facets.
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), material(BRAND.pink, 0x8a0030, 0.7))
    gem.position.y = PIN_TOP_Y // sits on top of the pillar

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 24), material(0x211a00, 0xffa400, 0.45))
    halo.position.y = PIN_TOP_Y // rings the gem

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
    ping.position.y = PIN_TOP_Y
    ping.visible = false

    // Billboard halo around the gem: the "these pins glow" cue, visible from far
    // away and brightest for the stop the traveller is actually heading to.
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pinGlowTexture(),
        color: GLOW_COLOR,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    glow.position.y = PIN_TOP_Y
    glow.scale.set(3.4, 3.4, 1)

    // Glowing puddle on the ground, so the pin reads as a place you can walk to
    // even when the gem is off screen or hidden behind a building.
    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.0, 40),
      new THREE.MeshBasicMaterial({
        color: GROUND_RING_COLOR,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    groundRing.rotation.x = -Math.PI / 2
    groundRing.position.y = 0.05

    const group = new THREE.Group()
    group.add(pillar, gem, halo, ping, glow, groundRing)

    // Sequence badge above the gem; camera-facing and drawn last so it never gets
    // lost behind the pin's own geometry. Landmark pins use a star instead of a
    // number, and the decorative MBS pin is built the same way.
    if (this.badgeLabel) {
      const badge = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: badgeTexture(this.badgeLabel, this.isNext),
          transparent: true,
          depthTest: false,
          depthWrite: false
        })
      )
      badge.position.y = BADGE_Y
      badge.scale.set(BADGE_SCALE, BADGE_SCALE, 1)
      badge.renderOrder = BADGE_RENDER_ORDER
      group.add(badge)
      this.badge = badge
    }

    group.scale.setScalar(0.001) // grows in on spawn
    this.scene.add(group)

    this.group = group
    this.gem = gem
    this.halo = halo
    this.ping = ping
    this.glow = glow
    this.groundRing = groundRing

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

  /**
   * Update the sequence badge and "next stop" highlight in place. Called on every
   * mission redraw so stamping/replanning cannot leave a stale number on a pin.
   */
  setBadge(label, isNext) {
    if (label === this.badgeLabel && isNext === this.isNext) return
    this.badgeLabel = label
    this.isNext = isNext

    if (!this.badge) return
    const previous = this.badge.material.map
    this.badge.material.map = badgeTexture(label, isNext)
    this.badge.material.needsUpdate = true
    previous?.dispose()
  }

  /** Advance the float / spin / heartbeat / sonar animation for this frame. */
  animate(dt, now) {
    const t = now / 1000
    const active = this.isNext ? 1 : 0

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

    this.gem.position.y = PIN_TOP_Y + bob
    this.halo.position.y = PIN_TOP_Y + bob
    this.ping.position.y = PIN_TOP_Y + bob
    this.glow.position.y = PIN_TOP_Y + bob
    if (this.badge) this.badge.position.y = BADGE_Y + bob * 0.6

    // The gem turns; the halo shimmers and sways. Both speed up near the pin.
    this.gem.rotation.y = t * (0.6 + near * 2.4) + this.phase
    this.halo.rotation.z = t * (0.5 + near * 2.0)
    this.halo.rotation.y = Math.sin(t * 0.8 + this.phase) * (0.2 + near * 0.3)

    // The gold halo around the gem always glows; approaching pushes it hotter.
    this.halo.material.emissiveIntensity = 0.45 + near * 1.1 + active * 0.25
    this.gem.material.emissiveIntensity = 0.7 + near * 0.6 + active * 0.35

    // Pink billboard halo: a slow shimmer keeps the pins alive without flickering.
    const shimmer = 0.5 + 0.5 * Math.sin(t * 2 + this.phase)
    this.glow.material.opacity = 0.4 + near * 0.22 + active * 0.24 + shimmer * 0.08
    const glowScale = 3.4 + near * 0.25 + active * 0.2 + shimmer * 0.1
    this.glow.scale.set(glowScale, glowScale, 1)

    // Ground puddle: always visible so distant pins read as places, not specks.
    this.groundRing.material.opacity = 0.2 + near * 0.24 + active * 0.22 + shimmer * (0.04 + active * 0.06)
    this.groundRing.scale.setScalar(1 + (0.03 + active * 0.04) * shimmer)

    // Heartbeat: a small scale pulse on the gem, strongest when close.
    const beat = 1 + near * 0.12 * (0.5 + 0.5 * Math.sin(t * 6 + this.phase))
    this.gem.scale.setScalar(beat)

    // The next stop's number badge pulses gently so the eye lands on it first.
    if (this.badge) {
      const badgeScale = BADGE_SCALE * (1 + active * 0.045 * (0.5 + 0.5 * Math.sin(t * 4 + this.phase)))
      this.badge.scale.set(badgeScale, badgeScale, 1)
    }

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
      // Sprites share one internal geometry, so only meshes own theirs.
      if (object.isMesh) object.geometry.dispose()
      if (!object.material) return
      // The glow texture is shared by every pin; the badge texture is this pin's.
      if (object.material.map && object.material.map !== sharedGlowTexture) {
        object.material.map.dispose()
      }
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
 * @param {object|null} nextLeg  the leg being walked now (its pin gets the bright
 *                              "next stop" treatment); pass null when there is none
 */
export function syncStopPins(map, pins, legs, nextLeg = null) {
  const keep = new Set()

  for (const leg of legs) {
    const key = `${leg.seq}:${leg.place_id || 'home'}`
    keep.add(key)

    const label = leg.kind === 'return' ? BADGE_HOME : String(leg.seq)
    const isNext = leg === nextLeg
    const existing = pins.get(key)
    if (existing) {
      existing.setBadge(label, isNext)
      continue
    }

    const pin = new PinLayer({ id: `pin-${key}`, lng: leg.lng, lat: leg.lat, label, isNext })
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
