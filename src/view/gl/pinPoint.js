import * as THREE from 'three'
import { MercatorCoordinate } from 'maplibre-gl'

// How big the pin renders, in "real meters" terms. Raised well above 1 because
// the raw geometry below is sized in tiny units (radius 0.55, etc.) — without
// this multiplier the pin would be nearly invisible at map scale.
const PIN_SCALE = 40

// MapLibre's "custom layer" contract: give it an object with an `id`, a
// `type: 'custom'`, a `renderingMode`, and two methods — onAdd() (called once)
// and render() (called every single frame). This class is that object.
export class PinLayer {
  constructor({ id, lng, lat }) {
    // Store what we were given so onAdd()/render() can use them later via `this`.
    this.id = id
    this.lng = lng
    this.lat = lat

    // Required by MapLibre so it knows to treat this as a custom WebGL layer...
    this.type = 'custom'
    // ...and specifically one that draws 3D content (not flat 2D icons).
    this.renderingMode = '3d'
  }

  // Called once by MapLibre, right when map.addLayer(this) runs. This is where
  // all one-time setup happens: building the scene, the pin's shape, and the
  // math needed to line it up with the real world. `map` is the MapLibre map
  // instance; `gl` is MapLibre's raw WebGL context (we reuse it below instead
  // of creating a separate one, so Three.js draws on the same canvas as the map).
  onAdd(map, gl) {
    this.map = map

    // A Three.js scene needs a camera and a scene graph, same as any Three.js
    // app — these start empty and get filled in below.
    this.camera = new THREE.Camera()
    this.scene = new THREE.Scene()

    // Lighting: HemisphereLight(skyColor, groundColor, intensity) lights faces
    // pointing up with `skyColor` and faces pointing down with `groundColor`.
    // Without any light, MeshLambertMaterial (below) would render pure black.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9cc7a4, 2.2))

    // Small helper: MeshLambertMaterial is a "matte" material (reacts to light,
    // not shiny). flatShading: true makes each flat face of a shape get a single
    // solid brightness instead of a smooth gradient — that's what gives the
    // whole scene its blocky, low-poly look instead of smooth curves.
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true })

    // The white stick: a thin cylinder. Params: (topRadius, bottomRadius, height, sides).
    // Only 6 sides, not round, to keep the faceted low-poly style.
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.2, 6), mat(0xffffff))
    pillar.position.y = 1.2 // lifted so its base sits near the ground, not centered on it

    // The diamond/gem: an octahedron (8-sided solid) is what gives the pointed
    // diamond shape. Params: (radius, detail). detail: 0 keeps it as a plain
    // 8-face diamond instead of subdividing into a rounder shape.
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), mat(0xf83878))
    gem.position.y = 2.75 // sits at the top of the pillar

    // The black ring halo around the gem: a torus (donut shape).
    // Params: (ringRadius, tubeRadius, tubeSides, ringSides).
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 24), mat(0x000000))
    halo.position.y = 2.75 // same height as the gem, so it rings around it

    // Group bundles the three meshes so they move/scale/rotate together as one
    // object, instead of having to reposition each piece individually.
    const group = new THREE.Group()
    group.add(pillar, gem, halo)
    this.scene.add(group) // nothing is visible until it's actually added to the scene

    // --- The coordinate math: lining up Three.js's local space with the real world ---

    // MapLibre's internal coordinate system is "Mercator projection units" — a
    // flattened 0–1 space, not meters or lat/lng. fromLngLat() converts our
    // real-world [lng, lat] into that internal space, so the pin can be placed
    // correctly inside MapLibre's own 3D world.
    const mc = MercatorCoordinate.fromLngLat([this.lng, this.lat], 0)

    // Mercator projection distorts scale depending on where on Earth you are
    // (stretching things out more the further you get from the equator).
    // meterInMercatorCoordinateUnits() answers "how big is 1 real meter, in
    // this projected unit system, right here" — necessary so the pin is a
    // consistent real-world size everywhere, not just at one latitude.
    const s = mc.meterInMercatorCoordinateUnits() * PIN_SCALE

    // This matrix answers: "if I drew something at (0,0,0) in my own Three.js
    // scene, where should that actually end up on the real map?" Built in three
    // steps, each one a standard transform:
    this.base = new THREE.Matrix4()
      .makeTranslation(mc.x, mc.y, mc.z) // move it to the pin's real map position
      .scale(new THREE.Vector3(s, -s, s)) // scale meters → Mercator units (y flipped: Three.js "up" vs. map "down")
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)) // rotate 90°: Three.js treats y as "up", the map treats z as "up"

    // Reuse the map's own canvas and WebGL context instead of creating a second
    // one — this is what makes Three.js draw directly on top of the map rather
    // than in a separate, disconnected layer.
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    // Tell Three.js not to clear the canvas before drawing — MapLibre already
    // drew the map itself; clearing would wipe that out before our pin appears.
    this.renderer.autoClear = false
  }

  // Called by MapLibre every single frame, automatically — this is the only
  // method that needs to run repeatedly; onAdd() above only ever runs once.
  render(gl, args) {
    // args.defaultProjectionData.mainMatrix is MapLibre's camera matrix FOR
    // THIS EXACT FRAME — wherever the user has currently panned/zoomed/rotated/
    // tilted to. Combining it with `this.base` (built once, in onAdd) answers:
    // "given where the camera is looking right now, and where my pin's local
    // origin sits, where does the pin actually appear on screen?"
    const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
    this.camera.projectionMatrix = m.multiply(this.base)

    // Reset Three.js's internal WebGL state tracking, since MapLibre's own
    // renderer just used the same shared context and left it in a different
    // state than Three.js expects.
    this.renderer.resetState()
    // The actual draw call: render our scene (the pin), through our camera
    // (now synced to the map's current view), onto the shared canvas.
    this.renderer.render(this.scene, this.camera)
  }
}
