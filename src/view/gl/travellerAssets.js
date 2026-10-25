// ─────────────────────────────────────────────────────────────────────────────
//  travellerAssets.js — THE WARDROBE (data + props only, no character here)
// ─────────────────────────────────────────────────────────────────────────────
//  This file holds the *resources* for the traveller character:
//    1. tiny helpers that build rounded shapes and materials
//    2. PALETTE  — every colour used, named
//    3. FURS     — the animal's own colouring (otter brown, grey, fox…)
//    4. ACCESSORIES — pre-built wearable props (backpack, hat, compass…)
//    5. OUTFITS  — preset combinations: "wear this shirt + these accessories"
//
//  traveller.js (the character builder) imports from here. Nothing in this file
//  imports from traveller.js — keeping the arrow pointing one way is what stops
//  the two files from depending on each other in a circle.
//
//  To add your own outfit, scroll to OUTFITS at the bottom and copy a block.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three'
// Three.js core only ships a hard-edged BoxGeometry. RoundedBoxGeometry is an
// official "addon" (lives in three/addons, not the main bundle) that gives the
// same box with softened corners — it is the single biggest reason the character
// reads as a soft toy instead of Minecraft.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// ── 1. MATERIAL HELPERS ──────────────────────────────────────────────────────
// A "material" is the surface description: what colour it is and how light
// bounces off it. MeshStandardMaterial is the physically-based one:
//   roughness 0 = mirror-smooth, 1 = completely matte
//   metalness 0 = cloth/skin/plastic, 1 = bare metal
// Picking different roughness/metalness per material type is what makes brass
// buckles glint while the fur stays flat and soft — same light, different feel.

// Guard against the quietest bug in this whole file: a mistyped colour name
// (PALETTE.sandDarke) is `undefined`, Three.js silently falls back to white, and
// you get a blank garment with no error printed anywhere. Shout about it instead.
function checked(color, where) {
  if (color == null) {
    console.warn(`[traveller] ${where} was given no colour — check the name in PALETTE/OUTFITS. Using magenta so it's obvious.`)
    return 0xff00ff
  }
  return color
}

export const furMat = (color) => new THREE.MeshStandardMaterial({ color: checked(color, 'furMat'), roughness: 0.95, metalness: 0 })
export const clothMat = (color) => new THREE.MeshStandardMaterial({ color: checked(color, 'clothMat'), roughness: 0.82, metalness: 0 })
export const leatherMat = (color) => new THREE.MeshStandardMaterial({ color: checked(color, 'leatherMat'), roughness: 0.5, metalness: 0.05 })
export const metalMat = (color) => new THREE.MeshStandardMaterial({ color: checked(color, 'metalMat'), roughness: 0.28, metalness: 0.85 })
// `emissive` makes a surface give off its own colour even with no light on it —
// used for the lantern flame so it looks lit from the inside.
export const glowMat = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.4 })

// ── 2. SHAPE HELPERS ─────────────────────────────────────────────────────────
// Every one of these returns a THREE.Mesh (geometry + material = a drawable
// object). They exist so the body/prop code below reads like a description of
// the character instead of a wall of `new THREE.Mesh(new THREE.…Geometry(…))`.

/** A sphere. `squash` lets you stretch it into an egg/pebble: { x, y, z } multipliers. */
export function ball(radius, material, squash) {
  // 20 width segments / 14 height segments = smooth enough to read as round,
  // cheap enough that the whole character stays a light load on a phone GPU.
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), material)
  if (squash) mesh.scale.set(squash.x ?? 1, squash.y ?? 1, squash.z ?? 1)
  return mesh
}

/** A capsule — a cylinder with a dome on each end. The go-to shape for limbs. */
export function pill(radius, length, material) {
  // CapsuleGeometry(radius, length, capSegments, radialSegments): `length` is the
  // straight middle section only, so total height = length + 2 * radius.
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 14), material)
}

/** A box with rounded corners — bags, boots, buckles, anything man-made. */
export function box(w, h, d, material, round = 0.05) {
  // The corner radius can never exceed half of the smallest side, or the geometry
  // folds in on itself — so clamp it rather than trusting the caller's number.
  const r = Math.max(0.001, Math.min(round, Math.min(w, h, d) / 2 - 0.001))
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material)
}

/** A cone/cylinder. Give rTop and rBottom different values to get a taper. */
export function tube(rTop, rBottom, height, material, sides = 16) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, height, sides), material)
}

/** A thin flat disc — compass faces, hat brims, lenses. */
export function disc(radius, thickness, material, sides = 20) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, sides), material)
}

/** A donut — belts, collars, straps around a neck, chain loops. */
export function ring(radius, thickness, material) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 10, 28), material)
}

/** Move an object and hand it straight back, so you can position it inline. */
export function at(obj, x = 0, y = 0, z = 0) {
  obj.position.set(x, y, z)
  return obj
}

/** Rotate an object (in degrees — easier to picture than radians) and hand it back. */
export function spin(obj, x = 0, y = 0, z = 0) {
  obj.rotation.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z))
  return obj
}

/** Bundle meshes into one object so they move together as a single prop. */
export function group(...children) {
  const g = new THREE.Group()
  g.add(...children)
  return g
}

// ── 3. PALETTE ───────────────────────────────────────────────────────────────
// Every colour in one place. 0x… is just hex, same as CSS #… — 0x8a6243 is #8a6243.
// Change a value here and every outfit using it updates at once.

export const PALETTE = {
  // Zoot brand — these four are the app's own tokens from src/view/styles/app.css
  // (--zt-yellow, --zt-yellow-pale, --zt-black, --zt-black-2). Keep them in sync
  // with that file: they're what makes the character look like it belongs here
  // rather than like a stock model dropped on the map.
  ztYellowDeep: 0xf0b800,  // the coat: a notch deeper than --zt-yellow, because
                           // strong lighting lifts it back up to taxi yellow
  ztYellowLight: 0xf7cf4a, // belly/muzzle: lighter than the coat but still clearly
                           // yellow — --zt-yellow-pale itself washes out to white
                           // once the key light hits it
  ztAmber: 0x9a7400,       // shaded amber for inner ears
  ztBlack: 0x111111,       // --zt-black
  ztBlack2: 0x282828,      // --zt-black-2
  ztGunmetal: 0x33322e,    // buckles/hardware that must read against yellow

  // fur + face
  furOtter: 0x8a6243, furCocoa: 0x56392a, furSand: 0xc5a070, furSlate: 0x8f8d88, furFox: 0xc4682c,
  cream: 0xf3e4c9,       // muzzle, chest and belly patch
  inner: 0xd99a8e,       // inside of the ears
  noseDark: 0x2b1d16,
  eyeDark: 0x1d1310,
  white: 0xffffff,

  // explorer kit (the mountain-trail look)
  olive: 0x6d7445, khaki: 0x7d6c50, canvasGreen: 0x6e7247,
  leather: 0x7d5130, leatherDark: 0x56361f, brass: 0xc79a3a, steel: 0xb9c0c4,

  // island kit
  coral: 0xef6a55, sandCloth: 0xe9dab2, sandDark: 0xc2a675, straw: 0xd8bd78, lensDark: 0x2a2f38,

  // city kit
  hoodieGrey: 0x6f7178, denim: 0x3a4a6b, sneakerWhite: 0xf2f2ef, ztPink: 0xf83878,

  // rain kit
  ztYellow: 0xffcc00, rubber: 0x24262b, slateBlue: 0x44506b,

  // ranger kit
  forest: 0x3f5d45, wool: 0xb0432f, lanternGlow: 0xffd978, woodBrown: 0x6b4a2f
}

// ── 4. FURS ──────────────────────────────────────────────────────────────────
// The character underneath the clothes. Swap with traveller.setFur('fox').
//   coat     — body, limbs, tail, ears
//   belly    — muzzle, cheeks, chest fur
//   inner    — inside of the ears      (optional, falls back to PALETTE.inner)
//   markings — nose and eyebrows       (optional, falls back to PALETTE.noseDark)

export const FURS = {
  // The house mascot: taxi yellow + ink black, same two colours as the app.
  zoot: { label: 'Zoot yellow', coat: PALETTE.ztYellowDeep, belly: PALETTE.ztYellowLight, inner: PALETTE.ztAmber, markings: PALETTE.ztBlack },
  otter: { label: 'Otter brown', coat: PALETTE.furOtter, belly: PALETTE.cream },
  cocoa: { label: 'Cocoa', coat: PALETTE.furCocoa, belly: 0xd9c3a2 },
  sand: { label: 'Sand', coat: PALETTE.furSand, belly: 0xfaf0dd },
  slate: { label: 'Slate', coat: PALETTE.furSlate, belly: 0xe8e6e0 },
  fox: { label: 'Fox', coat: PALETTE.furFox, belly: 0xfaeede }
}

// ── 5. ACCESSORIES ───────────────────────────────────────────────────────────
// The "preloaded assets" you can try on. Each entry is:
//
//   slot  — where on the body it attaches. traveller.js creates an empty marker
//           object at each of these spots ('head', 'face', 'neck', 'chest',
//           'back', 'waist', 'handL', 'handR') and parents the prop to it, so
//           the prop follows the body part automatically when it moves.
//   build — a function given the outfit's colours `c`, returning the 3D object.
//           Positions inside build() are RELATIVE to the slot, so (0,0,0) means
//           "exactly at the slot".
//
// Add a prop by adding one entry here, then naming it in an outfit's list below.

export const ACCESSORIES = {
  // The big canvas rucksack with a bedroll strapped on top, side pockets and
  // shoulder straps that wrap round to the front.
  backpack: {
    slot: 'back',
    build: (c) => {
      const canvas = clothMat(c.canvas)
      const strap = leatherMat(c.belt)
      const trim = metalMat(c.metal)

      const body = at(box(0.62, 0.66, 0.34, canvas, 0.14), 0, 0, -0.1)
      const lid = at(box(0.6, 0.22, 0.33, canvas, 0.1), 0, 0.3, -0.08)
      // Bedroll: a capsule laid on its side (rotate 90° about Z so it runs left-right).
      const bedroll = spin(at(pill(0.11, 0.42, clothMat(c.accent)), 0, 0.5, -0.1), 0, 0, 90)
      const pocketL = at(box(0.17, 0.24, 0.16, canvas, 0.06), -0.33, -0.08, -0.08)
      const pocketR = at(box(0.17, 0.24, 0.16, canvas, 0.06), 0.33, -0.08, -0.08)

      // Two shoulder straps. Each one is a RING standing in a front-to-back
      // plane (hence the 90° turn about Y), threaded around the torso: the top
      // of the circle crosses the shoulder, the front runs down his chest, and
      // the bottom vanishes inside his hips. A straight bar can't do that — it
      // either floats off the chest or stabs through his face.
      const makeStrap = (side) => spin(at(ring(0.44, 0.05, strap), side * 0.24, -0.02, 0.32), 0, 90, side * 8)
      const buckleL = at(box(0.11, 0.08, 0.05, trim, 0.02), -0.24, -0.2, 0.74)
      const buckleR = at(box(0.11, 0.08, 0.05, trim, 0.02), 0.24, -0.2, 0.74)
      const strapL = makeStrap(-1)
      const strapR = makeStrap(1)

      return group(body, lid, bedroll, pocketL, pocketR, strapL, strapR, buckleL, buckleR)
    }
  },

  // Metal water bottle clipped to the side of the pack.
  canteen: {
    slot: 'back',
    build: (c) => {
      const shell = metalMat(PALETTE.steel)
      const bottle = at(tube(0.1, 0.11, 0.28, shell), -0.42, -0.1, 0.0)
      const cap = at(tube(0.05, 0.05, 0.07, metalMat(c.metal)), -0.42, 0.07, 0.0)
      return group(bottle, cap)
    }
  },

  // A brass pocket compass — held open in the right paw, face tilted up to read.
  compass: {
    slot: 'handR',
    // `arm` = how far to swing that shoulder forward, in degrees, while this prop
    // is being held. Without it every held prop would dangle straight down: a
    // compass needs the arm out front, a walking stick needs it by his side.
    arm: -52,
    build: (c) => {
      const brass = metalMat(c.metal)
      const case_ = disc(0.115, 0.035, brass)
      const face = at(disc(0.092, 0.04, clothMat(PALETTE.white)), 0, 0.008, 0)
      // The needle: a sliver of a box, sitting flat on the face.
      const needle = at(box(0.016, 0.01, 0.13, clothMat(PALETTE.ztPink), 0.004), 0, 0.028, 0)
      const hinge = at(box(0.045, 0.03, 0.025, brass, 0.01), 0, 0, -0.12)
      // Lay the whole disc flat and tip it back 25° so the face catches the light.
      return spin(group(case_, face, needle, hinge), -25, 0, 0)
    }
  },

  // Small leather belt pouches with a flap and a buckle, one each side.
  beltPouch: {
    slot: 'waist',
    build: (c) => {
      const hide = leatherMat(c.belt)
      const trim = metalMat(c.metal)
      const makeOne = (x) => group(
        at(box(0.22, 0.24, 0.16, hide, 0.06), x, -0.08, 0.26),
        at(box(0.24, 0.1, 0.18, leatherMat(c.beltDark ?? c.belt), 0.04), x, 0.04, 0.27),
        at(box(0.05, 0.05, 0.03, trim, 0.012), x, -0.04, 0.36)
      )
      return group(makeOne(-0.34), makeOne(0.34))
    }
  },

  // Brass medallion on a chain — the little badge the explorer wears.
  medallion: {
    slot: 'neck',
    build: (c) => {
      const brass = metalMat(c.metal)
      // The chain is a thin torus standing upright around the neck.
      const chain = spin(ring(0.2, 0.012, brass), 90, 0, 0)
      const coin = spin(at(disc(0.09, 0.03, brass), 0, -0.18, 0.12), 90, 0, 0)
      return group(chain, coin)
    }
  },

  // Chunky camera hanging from a neck strap.
  camera: {
    slot: 'neck',
    build: (c) => {
      const shell = clothMat(PALETTE.eyeDark)
      const body = at(box(0.28, 0.2, 0.14, shell, 0.04), 0, -0.3, 0.2)
      const lens = spin(at(tube(0.08, 0.09, 0.12, metalMat(PALETTE.steel)), 0, -0.3, 0.3), 90, 0, 0)
      const strap = spin(ring(0.22, 0.015, clothMat(c.accent)), 90, 0, 0)
      return group(body, lens, strap)
    }
  },

  // Small sling bag worn across the chest.
  slingBag: {
    slot: 'chest',
    build: (c) => {
      const bagMat = clothMat(c.canvas)
      const bag = at(box(0.3, 0.26, 0.16, bagMat, 0.07), 0.34, -0.5, 0.0)
      // One diagonal strap: a long thin box rotated about Z to cut across the body.
      const strap = spin(at(box(0.07, 0.9, 0.05, clothMat(c.accent), 0.02), 0.1, -0.1, 0.05), 0, 0, 26)
      return group(bag, strap)
    }
  },

  // Umbrella: a dome canopy on a shaft with a hooked handle, held in the left paw.
  umbrella: {
    slot: 'handL',
    arm: -4, // held almost straight down, so the shaft stays upright
    build: (c) => {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), clothMat(c.accent))
      // Tall enough that the canopy clears the top of his head (he's ~2.25 tall
      // and the paw sits around y 0.75), otherwise the dome cuts through it.
      const shaft = at(tube(0.022, 0.022, 2.0, clothMat(PALETTE.woodBrown)), 0, 0.8, 0)
      const handle = spin(at(ring(0.07, 0.022, clothMat(PALETTE.woodBrown)), 0, -0.18, 0.07), 0, 90, 0)
      const ribs = spin(at(ring(0.6, 0.022, clothMat(c.accent)), 0, 1.88, 0), 90, 0, 0) // sits exactly on the canopy rim
      // Only a gentle lean. Tilt it much further and the shaft hides behind his
      // head, leaving the canopy floating there looking like a second hat.
      return spin(group(at(canopy, 0, 1.72, 0), shaft, handle, ribs), 0, 0, -11)
    }
  },

  // Chunky knitted scarf with two loose ends.
  scarf: {
    slot: 'neck',
    build: (c) => {
      const wool = clothMat(c.accent)
      const loop = spin(ring(0.26, 0.09, wool), 90, 0, 0)
      const tailA = spin(at(box(0.14, 0.44, 0.08, wool, 0.04), -0.12, -0.3, 0.22), 10, 0, 6)
      const tailB = spin(at(box(0.14, 0.32, 0.08, wool, 0.04), 0.14, -0.24, 0.2), 10, 0, -8)
      return group(loop, tailA, tailB)
    }
  },

  // A tall walking staff. Sized so the tip lands on the ground with the arm
  // hanging almost straight down (arm: -6 below).
  walkingStick: {
    slot: 'handR',
    arm: -6,
    build: () => {
      const wood = clothMat(PALETTE.woodBrown)
      const shaft = at(tube(0.028, 0.038, 1.3, wood), 0, 0.02, 0)
      const grip = spin(at(ring(0.05, 0.022, leatherMat(PALETTE.leatherDark)), 0, 0.1, 0), 90, 0, 0)
      const knot = at(ball(0.06, wood, { y: 0.7 }), 0, 0.6, 0)
      return spin(group(shaft, grip, knot), 4, 0, 5)
    }
  },

  // Camp lantern with a glowing core — the only part of the kit that emits light.
  lantern: {
    slot: 'handL',
    arm: -14,
    build: (c) => {
      const frame = metalMat(c.metal)
      const cage = at(box(0.2, 0.26, 0.2, frame, 0.05), 0, -0.12, 0)
      const flame = at(ball(0.08, glowMat(PALETTE.lanternGlow)), 0, -0.12, 0)
      const handleBar = spin(at(ring(0.09, 0.015, frame), 0, 0.04, 0), 0, 90, 0)
      return group(cage, flame, handleBar)
    }
  }
}


// ── 6. HATS ──────────────────────────────────────────────────────────────────
// Headgear, picked independently of the outfit (Me → Character). Each entry is
// { label, build(colors) } and is parented to the 'head' slot, which sits at
// hat-band height on the skull — so a build() that returns something centred on
// (0, 0, 0) lands on his forehead, not floating above his crown.
//
// `none` has no build at all; the code that applies a hat just skips it.

export const HATS = {
  none: { label: 'No hat' },

  // Zoot baseball cap: dome crown plus a curved peak over the eyes.
  cap: {
    label: 'Zoot cap',
    build: (c) => {
      const shell = clothMat(c.hat ?? PALETTE.ztYellowDeep)
      const peakMat = clothMat(c.hatTrim ?? PALETTE.ztBlack)
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell)
      // The peak is HALF a disc, not a whole one — the last two CylinderGeometry
      // arguments sweep only 180° of the circle, so it juts forward over his
      // eyes instead of ringing the whole head like a hat band.
      const peak = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 0.045, 20, 1, false, -Math.PI / 2, Math.PI),
        peakMat
      )
      peak.scale.set(1, 1, 0.9)       // slightly shorter front-to-back than it is wide
      at(peak, 0, -0.03, 0.02)
      spin(peak, -7, 0, 0)            // tipped down a touch, to shade rather than point
      const button = at(ball(0.05, peakMat), 0, 0.43, 0)
      return at(group(crown, peak, button), 0, -0.07, 0)
    }
  },

  // Canvas bucket hat: a short straight crown with a brim that slopes down.
  bucket: {
    label: 'Bucket hat',
    build: (c) => {
      const cloth = clothMat(c.hat ?? c.canvas ?? PALETTE.canvasGreen)
      const crown = at(tube(0.38, 0.42, 0.3, cloth, 22), 0, 0.14, 0)
      const top = at(disc(0.38, 0.04, cloth, 22), 0, 0.29, 0)
      // A cone with its wide end at the BOTTOM gives the downward droop; a flat
      // disc here would read as a boater, not a bucket hat.
      const brim = at(tube(0.44, 0.6, 0.07, cloth, 26), 0, -0.04, 0)
      const band = spin(at(ring(0.42, 0.035, clothMat(c.hatTrim ?? c.accent ?? PALETTE.leatherDark)), 0, 0.05, 0), 90, 0, 0)
      return at(group(crown, top, brim, band), 0, -0.04, 0)
    }
  },

  // Wide straw sun hat: a shallow dome crown plus a big flat brim.
  sunHat: {
    label: 'Straw sun hat',
    build: (c) => {
      const straw = clothMat(c.hat ?? PALETTE.straw)
      // A sphere cut in half: SphereGeometry's last two numbers are the vertical
      // sweep — starting at 0 and sweeping only halfway round gives a dome.
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), straw)
      const brim = at(disc(0.56, 0.035, straw, 28), 0, -0.01, 0)
      const band = at(ring(0.3, 0.035, clothMat(c.accent)), 0, 0.07, 0)
      return at(group(crown, brim, spin(band, 90, 0, 0)), 0, 0.04, 0)
    }
  },

  // Knitted beanie with a folded brim and a pompom.
  beanie: {
    label: 'Beanie',
    build: (c) => {
      const knit = clothMat(c.hat ?? c.accent)
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), knit)
      const brim = at(ring(0.4, 0.07, clothMat(c.accent)), 0, 0.02, 0)
      const pom = at(ball(0.1, knit), 0, 0.44, 0)
      return at(group(crown, spin(brim, 90, 0, 0), pom), 0, -0.1, 0)
    }
  },

  // Bandana knotted at the back — a flat band with a knot and two loose tails.
  bandana: {
    label: 'Bandana',
    build: (c) => {
      const cloth = clothMat(c.hat ?? c.accent ?? PALETTE.ztPink)
      const band = at(tube(0.44, 0.45, 0.16, cloth, 24), 0, 0.02, 0)
      const knot = at(ball(0.09, cloth), 0, 0.0, -0.42)
      const tailA = spin(at(box(0.09, 0.26, 0.05, cloth, 0.02), -0.06, -0.14, -0.46), 18, 0, 10)
      const tailB = spin(at(box(0.09, 0.2, 0.05, cloth, 0.02), 0.07, -0.11, -0.45), 18, 0, -12)
      return at(group(band, knot, tailA, tailB), 0, 0.04, 0)
    }
  },

  // The raincoat's hood, pushed up over the head.
  hood: {
    label: 'Rain hood',
    build: (c) => {
      const coat = clothMat(c.shirt)
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.54, 22, 14, 0, Math.PI * 2, 0, Math.PI / 1.95), coat)
      // Squash it front-to-back and pull it well backwards. Keep the front rim
      // behind the skull front (z 0.44) or it stops being a hood and becomes a
      // yellow motorcycle helmet with a face hole.
      shell.scale.set(1.02, 1, 0.9)
      return at(group(shell), 0, -0.12, -0.24)
    }
  }
}

// ── 7. EYEWEAR ───────────────────────────────────────────────────────────────
// Parented to the 'face' slot, which sits just clear of the eyeballs (they bulge
// to z 0.5, the slot is at 0.52) — so lenses at local z 0 rest right on them.

export const EYEWEAR = {
  none: { label: 'No eyewear' },

  // Dark round sunglasses sitting over the eyes.
  sunglasses: {
    label: 'Round shades',
    build: () => {
      const glass = new THREE.MeshStandardMaterial({ color: PALETTE.lensDark, roughness: 0.15, metalness: 0.3 })
      const frame = metalMat(PALETTE.brass)
      const lensL = spin(at(disc(0.13, 0.025, glass), -0.19, 0, 0), 90, 0, 0)
      const lensR = spin(at(disc(0.13, 0.025, glass), 0.19, 0, 0), 90, 0, 0)
      const bridge = at(box(0.14, 0.025, 0.025, frame, 0.008), 0, 0.02, 0)
      return group(lensL, lensR, bridge)
    }
  },

  // Aviators: teardrop lenses (round ones squashed in Y) in a thin gold frame.
  aviators: {
    label: 'Aviators',
    build: () => {
      const glass = new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.12, metalness: 0.4 })
      const frame = metalMat(PALETTE.brass)
      const lens = (side) => {
        const l = spin(at(disc(0.15, 0.022, glass), side * 0.2, -0.01, 0), 90, 0, 0)
        l.scale.set(1, 1, 0.78) // after the 90° turn this squashes the lens vertically
        return l
      }
      const rimL = spin(at(ring(0.15, 0.012, frame), -0.2, -0.01, 0), 0, 0, 0)
      const rimR = spin(at(ring(0.15, 0.012, frame), 0.2, -0.01, 0), 0, 0, 0)
      rimL.scale.set(1, 0.78, 1)
      rimR.scale.set(1, 0.78, 1)
      const bridge = at(box(0.14, 0.02, 0.02, frame, 0.006), 0, 0.05, 0)
      const browBar = at(box(0.5, 0.018, 0.02, frame, 0.006), 0, 0.09, 0)
      return group(lens(-1), lens(1), rimL, rimR, bridge, browBar)
    }
  },

  // Trail goggles: thick-rimmed lenses with a strap running round the skull.
  goggles: {
    label: 'Trail goggles',
    build: (c) => {
      const glass = new THREE.MeshStandardMaterial({ color: 0xbfd9c4, roughness: 0.1, metalness: 0.2 })
      const rim = leatherMat(c.belt ?? PALETTE.leatherDark)
      const cup = (side) => group(
        spin(at(disc(0.14, 0.03, glass), side * 0.2, 0, 0.01), 90, 0, 0),
        spin(at(ring(0.145, 0.035, rim), side * 0.2, 0, 0), 0, 0, 0)
      )
      const bridge = at(box(0.1, 0.05, 0.04, rim, 0.015), 0, 0, 0)
      // The strap is a ring lying flat around the head. The face slot is 0.52 in
      // front of the skull centre, so the ring has to be pushed back by that much
      // to sit on his head rather than hovering off his nose.
      const strap = spin(at(ring(0.44, 0.03, rim), 0, -0.09, -0.52), 90, 0, 0)
      return group(cup(-1), cup(1), bridge, strap)
    }
  },

  // Thin wire reading specs: just two rims and a bridge, no tinted lens at all.
  specs: {
    label: 'Reading specs',
    build: () => {
      const wire = metalMat(PALETTE.steel)
      const rimL = at(ring(0.13, 0.011, wire), -0.19, -0.01, 0)
      const rimR = at(ring(0.13, 0.011, wire), 0.19, -0.01, 0)
      const bridge = at(box(0.13, 0.016, 0.016, wire, 0.005), 0, 0.0, 0)
      const armL = spin(at(box(0.016, 0.3, 0.016, wire, 0.005), -0.31, 0.0, -0.12), 0, 70, 0)
      const armR = spin(at(box(0.016, 0.3, 0.016, wire, 0.005), 0.31, 0.0, -0.12), 0, -70, 0)
      return group(rimL, rimR, bridge, armL, armR)
    }
  }
}

// ── 8. OUTFITS ───────────────────────────────────────────────────────────────
// A preset = colours for the clothes the body itself wears (shirt/pants/boots/
// belt), plus a list of accessory names from ACCESSORIES above.
//
// Headgear and eyewear are NOT in that list any more: they're picked separately
// (Me → Character) so you can wear any hat with any kit. What an outfit carries
// instead is `hat` and `eyewear` — a SUGGESTION, applied when you first choose
// the outfit and then yours to override. That way "Island Hopper" still arrives
// wearing its sun hat without locking you into it.
//
// `colors` keys and who uses them:
//   shirt, pants, boots, belt   → painted onto the body meshes in traveller.js
//   beltDark                    → the darker leather used for flaps/soles
//   canvas, metal, accent, hat  → read by the accessory builders above
//
// Try one with:  traveller.setOutfit('island')

export const OUTFITS = {
  // The default kit, and the one he wears on the map: black gear with yellow
  // webbing, so the whole character is the app's two brand colours and nothing
  // else. Worn over the 'zoot' fur it reads as the Zoot mascot rather than as
  // a generic woodland animal.
  zoot: {
    label: 'Zoot Courier',
    colors: {
      shirt: PALETTE.ztBlack, pants: PALETTE.ztBlack2, boots: PALETTE.ztBlack,
      belt: PALETTE.ztYellowDeep, beltDark: PALETTE.ztBlack,
      // Pack in gunmetal rather than the shirt's black, or its whole silhouette
      // disappears into his back; hardware dark so it reads on yellow webbing.
      canvas: PALETTE.ztGunmetal, metal: PALETTE.ztBlack2, accent: PALETTE.ztYellowDeep
    },
    hat: 'cap', eyewear: 'none',
    accessories: ['backpack', 'beltPouch', 'medallion', 'compass']
  },

  explorer: {
    label: 'Trail Explorer',
    colors: {
      shirt: PALETTE.olive, pants: PALETTE.khaki, boots: PALETTE.leather,
      belt: PALETTE.leather, beltDark: PALETTE.leatherDark,
      canvas: PALETTE.canvasGreen, metal: PALETTE.brass, accent: PALETTE.leatherDark
    },
    hat: 'bucket', eyewear: 'none',
    accessories: ['backpack', 'canteen', 'beltPouch', 'medallion', 'compass']
  },

  island: {
    label: 'Island Hopper',
    colors: {
      shirt: PALETTE.coral, pants: PALETTE.sandDark, boots: PALETTE.leatherDark,
      belt: PALETTE.sandCloth, beltDark: PALETTE.leatherDark,
      canvas: PALETTE.sandCloth, metal: PALETTE.brass, accent: PALETTE.coral, hat: PALETTE.straw
    },
    hat: 'sunHat', eyewear: 'sunglasses',
    accessories: ['camera']
  },

  city: {
    label: 'City Wanderer',
    colors: {
      shirt: PALETTE.hoodieGrey, pants: PALETTE.denim, boots: PALETTE.sneakerWhite,
      belt: PALETTE.denim, beltDark: PALETTE.eyeDark,
      canvas: PALETTE.eyeDark, metal: PALETTE.steel, accent: PALETTE.ztPink, hat: PALETTE.ztPink
    },
    hat: 'beanie', eyewear: 'specs',
    accessories: ['slingBag']
  },

  rain: {
    label: 'Monsoon Ready',
    colors: {
      shirt: PALETTE.ztYellow, pants: PALETTE.slateBlue, boots: PALETTE.rubber,
      belt: PALETTE.ztYellow, beltDark: PALETTE.rubber,
      canvas: PALETTE.slateBlue, metal: PALETTE.steel, accent: PALETTE.slateBlue
    },
    hat: 'hood', eyewear: 'none',
    accessories: ['umbrella']
  },

  ranger: {
    label: 'Night Ranger',
    colors: {
      shirt: PALETTE.forest, pants: PALETTE.leatherDark, boots: PALETTE.leatherDark,
      belt: PALETTE.leather, beltDark: PALETTE.leatherDark,
      canvas: PALETTE.forest, metal: PALETTE.brass, accent: PALETTE.wool
    },
    hat: 'bandana', eyewear: 'goggles',
    accessories: ['scarf', 'beltPouch', 'walkingStick', 'lantern']
  }
}

/** Look up an outfit by name, falling back to the house kit if it's unknown. */
export const getOutfit = (name) => OUTFITS[name] ?? OUTFITS.zoot
/** Look up a fur by name, falling back to the house colours. */
export const getFur = (name) => FURS[name] ?? FURS.zoot
/** Look up a hat. Unknown names (and 'none') mean bare-headed. */
export const getHat = (name) => HATS[name] ?? HATS.none
/** Look up eyewear. Unknown names (and 'none') mean no glasses. */
export const getEyewear = (name) => EYEWEAR[name] ?? EYEWEAR.none
