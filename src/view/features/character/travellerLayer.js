// ─────────────────────────────────────────────────────────────────────────────
//  travellerLayer.js — PUTTING THE CHARACTER ON THE MAP
// ─────────────────────────────────────────────────────────────────────────────
//  traveller.js builds a character that knows nothing about maps. This file is
//  the adapter: it wraps him in MapLibre's "custom layer" contract so he can
//  stand at a real [lng, lat] on the 3D map, keep his size and facing as you
//  pan/zoom/tilt, and animate every frame.
//
//  It's the same pattern as pinPoint.js (PinLayer) — read that first if the
//  matrix maths below is unfamiliar; the comments there explain it step by step.
//
//  USE IT (in MapView.vue):
//    import { TravellerLayer } from './travellerLayer.js'
//
//    const you = new TravellerLayer({ id: 'zt-traveller', lng: 103.8607, lat: 1.2830 })
//    map.on('load', () => map.addLayer(you))
//
//    you.setLngLat(lng, lat)   // move him (e.g. follow the GPS fix)
//    you.setBearing(90)        // face east
//    you.setMoving(true)       // switch the idle bob to a walk cycle
//    you.setOutfit('rain')     // change clothes live (default kit is 'zoot')
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { MercatorCoordinate } from 'maplibre-gl'
import { createTraveller } from './traveller.js'

// He's ~2.25 units tall in his own space, so a scale of 10 makes him about 22
// "map metres" tall. That still sounds enormous, but the map's default quest
// zoom is 16.5 with a steep pitch — at life size he'd be a couple of pixels.
// Treat this as "how readable is the avatar", not "how tall is an otter":
// big enough to recognise at a glance, small enough to sit in a street rather
// than straddle it. Raise it if he gets lost among tall buildings.
const DEFAULT_SCALE = 10

export class TravellerLayer {
  constructor({ id = 'zt-traveller', lng, lat, outfit = 'zoot', fur = 'zoot', hat, eyewear, scale = DEFAULT_SCALE, bearing = 0 } = {}) {
    this.id = id
    this.lng = lng
    this.lat = lat
    this.scaleFactor = scale
    this.bearing = bearing
    this.outfitName = outfit
    this.furName = fur
    this.hatName = hat
    this.eyewearName = eyewear
    this.moving = false

    // MapLibre's custom-layer contract: it looks for exactly these two fields
    // to know this object is a WebGL layer drawing 3D content.
    this.type = 'custom'
    this.renderingMode = '3d'

    // Animation clock. performance.now() is milliseconds since the page loaded;
    // dividing by 1000 gives seconds, which is what traveller.update() wants.
    this.start = performance.now()
  }

  // Runs once, when map.addLayer(this) is called.
  onAdd(map, gl) {
    this.map = map
    this.camera = new THREE.Camera()
    this.scene = new THREE.Scene()

    // LIGHTING. The character uses MeshStandardMaterial, which is pitch black
    // without lights. Two lights is the classic minimum:
    //   hemisphere = soft ambient fill (warm from the sky, green bounce from the ground)
    //   directional = the "sun" that creates one clear bright side and one shaded side
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd2a8, 2.0))
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.4)
    sun.position.set(3, 6, 4) // direction only — a directional light has no position on the map, just an angle
    this.scene.add(sun)
    // A dim light from behind picks out his silhouette against dark buildings.
    const rim = new THREE.DirectionalLight(0xcfe3ff, 0.8)
    rim.position.set(-3, 2, -4)
    this.scene.add(rim)

    // THE CHARACTER.
    this.traveller = createTraveller({ outfit: this.outfitName, fur: this.furName, hat: this.hatName, eyewear: this.eyewearName })
    this.traveller.setBearing(this.bearing)
    this.scene.add(this.traveller.group)

    this.updateMatrix()

    // Draw onto MapLibre's own canvas and WebGL context, so Three.js renders
    // into the same image as the map instead of a separate layer on top.
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false // MapLibre already drew the map — don't wipe it
  }

  // Rebuilt whenever he moves. Converts his real [lng, lat] into MapLibre's
  // internal Mercator space and works out how to get from "his local origin"
  // to "that spot on the planet". See pinPoint.js for the line-by-line version.
  updateMatrix() {
    const mc = MercatorCoordinate.fromLngLat([this.lng, this.lat], 0)
    const s = mc.meterInMercatorCoordinateUnits() * this.scaleFactor
    this.base = new THREE.Matrix4()
      .makeTranslation(mc.x, mc.y, mc.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
  }

  // Runs every frame, automatically.
  render(gl, args) {
    // onRemove() nulls this out; a stray frame after removal would otherwise throw.
    if (!this.traveller) return
    const t = (performance.now() - this.start) / 1000
    this.traveller.update(t, this.moving)

    // Combine MapLibre's camera matrix for THIS frame with his placement matrix,
    // so he lands in the right spot no matter where the user has panned to.
    const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
    this.camera.projectionMatrix = m.multiply(this.base)

    this.renderer.resetState() // MapLibre just used this context — re-sync Three's idea of its state

    // --- Depth handover: the part that makes him visible at all ---
    // MapLibre carves the depth buffer into a thin slice per style layer (via
    // gl.depthRange) so its own layers can't z-fight, and it has already written
    // the ground and buildings into that buffer by the time we run. Three.js
    // knows nothing about either: resetState() restores Three's own state cache
    // but deliberately does NOT touch depthRange, so our character ends up
    // squeezed into whatever slice was left set — at a depth BEHIND the map's
    // own ground. He renders perfectly, in exactly the right place, and is then
    // thrown away by the depth test. (The same thing quietly eats the bottom of
    // the pins in pinPoint.js; they only survive because they're 88 m tall.)
    //
    // So: give ourselves the full depth range back, then wipe the depth the map
    // wrote. Clearing is what threebox and most MapLibre+Three integrations do.
    // The trade-off is that he draws over buildings rather than being hidden
    // inside them — which is what you want for a "you are here" avatar anyway.
    // Clearing only DEPTH (not colour) keeps the map image itself intact, and
    // his own parts still occlude each other correctly.
    gl.depthRange(0, 1)
    this.renderer.clearDepth()

    this.renderer.render(this.scene, this.camera)

    // MapLibre only redraws when something changes (pan, zoom, new tiles). Since
    // he animates on his own, ask for the next frame explicitly — without this
    // line he freezes the instant you stop touching the map.
    this.map.triggerRepaint()
  }

  // ── Controls you can call from the Vue component ───────────────────────────

  /** Move him to a new position. */
  setLngLat(lng, lat) {
    this.lng = lng
    this.lat = lat
    if (this.map) this.updateMatrix()
  }

  /** Face a compass direction in degrees (0 = north, 90 = east, 180 = south). */
  setBearing(deg) {
    this.bearing = deg
    this.traveller?.setBearing(deg)
  }

  /** true = walk cycle, false = stand and breathe. */
  setMoving(moving) { this.moving = !!moving }

  /** 'zoot' | 'explorer' | 'island' | 'city' | 'rain' | 'ranger' */
  setOutfit(name) {
    this.outfitName = name
    this.traveller?.setOutfit(name)
  }

  /** 'zoot' | 'otter' | 'cocoa' | 'sand' | 'slate' | 'fox' */
  setFur(name) {
    this.furName = name
    this.traveller?.setFur(name)
  }

  /** 'none' | 'cap' | 'bucket' | 'sunHat' | 'beanie' | 'bandana' | 'hood' */
  setHat(name) {
    this.hatName = name
    this.traveller?.setHat(name)
  }

  /** 'none' | 'sunglasses' | 'aviators' | 'goggles' | 'specs' */
  setEyewear(name) {
    this.eyewearName = name
    this.traveller?.setEyewear(name)
  }

  /** How many map-metres tall he is (roughly scale * 2.2). */
  setScale(scale) {
    this.scaleFactor = scale
    if (this.map) this.updateMatrix()
  }

  // MapLibre calls this on map.removeLayer(id) / map.remove(). Freeing the
  // geometry and materials here is what stops repeated page visits from slowly
  // filling up GPU memory.
  onRemove() {
    this.traveller?.dispose()
    this.traveller = null
  }
}

/**
 * Compass bearing in degrees (0 = north) from one {lng, lat} to another.
 * Used to turn the traveller to face the way you're actually walking.
 *
 * This is the standard "initial bearing" formula for two points on a sphere —
 * you can't just do atan2(dLat, dLng), because a degree of longitude covers less
 * ground the further you are from the equator, which is what the cos(lat) terms
 * are correcting for.
 */
export function bearingBetween(from, to) {
  const rad = Math.PI / 180
  const dLng = (to.lng - from.lng) * rad
  const lat1 = from.lat * rad
  const lat2 = to.lat * rad
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) / rad + 360) % 360
}
