// ─────────────────────────────────────────────────────────────────────────────
//  traveller.js — THE CHARACTER
// ─────────────────────────────────────────────────────────────────────────────
//  Builds the Zoot traveller: a chunky, round-faced otter mascot, assembled
//  entirely out of spheres, capsules and rounded boxes — no modelling software,
//  no .glb file to download. Everything he *wears* lives in travellerAssets.js;
//  this file only knows about the animal underneath and where things attach.
//
//  USE IT:
//    import { createTraveller } from './traveller.js'
//
//    const guy = createTraveller()                      // Zoot yellow + black kit
//    scene.add(guy.group)          // guy.group is a normal THREE.Object3D
//    guy.setOutfit('island')       // swap the whole kit
//    guy.setFur('fox')             // recolour the animal
//    guy.update(seconds, moving)   // call once per frame to animate him
//
//  He stands on y = 0 (feet on the floor) and is about 2.25 units tall, facing
//  +Z. Scale the group if you need him bigger.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three'
import {
  ACCESSORIES, EYEWEAR, HATS, OUTFITS, getEyewear, getFur, getHat, getOutfit, PALETTE,
  at, ball, box, clothMat, furMat, group, leatherMat, metalMat, pill, ring, spin, tube
} from './travellerAssets.js'

// The black "ink line" drawn around every shape. One shared material for the
// whole character, because every outline is the same flat colour.
//   side: BackSide  — only draw the *inside* faces of the copy. The trick: clone
//   each shape slightly larger, show only its inside, and the bits poking out
//   from behind the real shape read as a drawn outline. This is the classic
//   "inverted hull" cartoon outline, and it's why he looks illustrated rather
//   than like a default grey 3D model.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x241a13, side: THREE.BackSide })

/** Give every mesh under `root` an outline copy. Skips anything flagged noOutline. */
function outlineAll(root, thickness = 0.055) {
  // Collect first, THEN add — adding children while traversing would make
  // traverse() walk into the outlines we just created and outline those too.
  const meshes = []
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline) meshes.push(o) })
  for (const mesh of meshes) {
    const shell = new THREE.Mesh(mesh.geometry, OUTLINE_MAT)
    // Parenting the shell TO the mesh means it inherits every move, rotation and
    // squash automatically — the outline can never drift out of sync.
    shell.scale.setScalar(1 + thickness)
    shell.userData.noOutline = true
    mesh.add(shell)
  }
}

/** Remove a prop and hand its GPU memory back — geometry/materials aren't garbage collected on their own. */
function disposeChildren(parent) {
  for (const child of [...parent.children]) {
    child.traverse((o) => {
      if (!o.isMesh) return
      o.geometry.dispose()
      // The shared outline material is reused forever, so never dispose that one.
      if (o.material !== OUTLINE_MAT) o.material.dispose()
    })
    parent.remove(child)
  }
}

export function createTraveller({ outfit = 'zoot', fur = 'zoot', hat, eyewear, outline = true, shadow = true } = {}) {
  const startFur = getFur(fur)
  const startKit = getOutfit(outfit)
  // Unnamed hat/eyewear fall back to whatever the chosen kit suggests.
  hat = hat ?? startKit.hat ?? 'none'
  eyewear = eyewear ?? startKit.eyewear ?? 'none'

  // ── MATERIALS ──────────────────────────────────────────────────────────────
  // Made once and kept in `M`. Recolouring later is then just M.shirt.color.set(…)
  // — no rebuilding geometry, which is why outfit swaps are instant.
  const M = {
    coat: furMat(startFur.coat),       // the fur
    belly: furMat(startFur.belly),     // muzzle, chest, cheeks
    // Both of these can be overridden per-fur (see FURS), so the yellow mascot
    // gets ink-black brows and amber ears while the brown otter keeps pink ones.
    inner: furMat(startFur.inner ?? PALETTE.inner),         // inside of the ears
    nose: furMat(startFur.markings ?? PALETTE.noseDark),    // nose + eyebrows
    eye: new THREE.MeshStandardMaterial({ color: PALETTE.eyeDark, roughness: 0.25 }),
    shine: new THREE.MeshBasicMaterial({ color: PALETTE.white }), // eye highlight: unlit, so it always stays bright
    shirt: clothMat(startKit.colors.shirt),
    pants: clothMat(startKit.colors.pants),
    boots: leatherMat(startKit.colors.boots),
    belt: leatherMat(startKit.colors.belt),
    beltDark: leatherMat(startKit.colors.beltDark ?? startKit.colors.belt),
    metal: metalMat(startKit.colors.metal)
  }

  // `root` is the whole character. Everything below gets added into it.
  const root = new THREE.Group()

  // ── LEGS + BOOTS ───────────────────────────────────────────────────────────
  // Each leg hangs from its own little pivot Group placed at the hip. Rotating
  // the PIVOT swings the leg from the hip (correct); rotating the leg mesh would
  // spin it around its own middle (wrong). Same idea is used for arms and tail.
  function makeLeg(side) {
    // The pivot sits high (0.78) and the boot hangs well below it, so there's a
    // visible stretch of trouser in between — otherwise the body blob swallows
    // the legs completely and he looks like a sack with feet.
    const hip = at(new THREE.Group(), side * 0.19, 0.78, 0)

    const thigh = at(pill(0.135, 0.26, M.pants), 0, -0.22, 0)
    const cuff = at(ring(0.14, 0.05, M.pants), 0, -0.46, 0)

    // The boot hangs off a SECOND pivot, at ankle height. Without it the foot is
    // welded to the thigh and swings through the air pointing wherever the leg
    // points — the thing that makes a cheap walk cycle look like a marionette.
    // With it, update() can counter-rotate the ankle so the sole stays roughly
    // level with the ground through the step.
    const foot = at(new THREE.Group(), 0, -0.52, 0)
    foot.add(
      at(box(0.3, 0.26, 0.44, M.boots, 0.11), 0, -0.12, 0.04),
      at(ball(0.15, M.boots, { y: 0.85, z: 0.9 }), 0, -0.14, 0.17),  // rounded toe cap
      at(box(0.33, 0.08, 0.47, M.beltDark, 0.03), 0, -0.23, 0.05)    // sole
    )

    hip.add(thigh, spin(cuff, 90, 0, 0), foot)
    return { hip, foot }
  }
  const legL = makeLeg(-1)
  const legR = makeLeg(1)

  // ── BODY ───────────────────────────────────────────────────────────────────
  // Three overlapping squashed spheres: hips (trousers), belly and chest (shirt).
  // Overlapping soft blobs is what gives the plump, stuffed-toy silhouette —
  // a single box torso would read as a robot.
  const hips = at(ball(0.42, M.pants, { x: 1, y: 0.78, z: 0.88 }), 0, 0.86, 0)
  const belly = at(ball(0.5, M.shirt, { x: 0.95, y: 0.85, z: 0.82 }), 0, 1.14, 0)
  const chest = at(ball(0.4, M.shirt, { x: 1.05, y: 0.78, z: 0.9 }), 0, 1.38, 0)
  const collar = spin(at(ring(0.26, 0.055, M.shirt), 0, 1.52, 0), 90, 0, 0)
  // The pale chest fur showing above the shirt collar.
  const bib = at(ball(0.22, M.belly, { x: 1.1, y: 0.85, z: 0.5 }), 0, 1.52, 0.2)

  // Belt: a torus laid flat. It lives in its own group so squashing it
  // front-to-back (scale.z) doesn't also squash the buckle.
  const beltLoop = group(spin(ring(0.45, 0.06, M.belt), 90, 0, 0))
  beltLoop.position.y = 0.98
  beltLoop.scale.z = 0.86
  const buckle = at(box(0.17, 0.14, 0.07, M.metal, 0.03), 0, 0.98, 0.4)

  // ── ARMS ───────────────────────────────────────────────────────────────────
  function makeArm(side) {
    // x = 0.58 puts the shoulder just outside the belly (which reaches x 0.475),
    // so the arm reads as an arm instead of disappearing into the torso.
    const shoulder = at(new THREE.Group(), side * 0.58, 1.38, 0)
    const sleeve = at(pill(0.125, 0.2, M.shirt), 0, -0.18, 0)

    // Same idea as the ankle: everything below the elbow hangs off its own
    // pivot, so the forearm can trail a fraction behind the upper arm instead
    // of the whole limb swinging as one rigid plank.
    const elbow = at(new THREE.Group(), 0, -0.34, 0)
    elbow.add(
      at(pill(0.11, 0.16, M.coat), 0, -0.08, 0),
      at(ball(0.15, M.coat, { y: 0.9 }), 0, -0.28, 0.03)  // paw
    )

    shoulder.add(sleeve, elbow)
    // Tilt the arms slightly away from the body so they don't sink into it.
    shoulder.rotation.z = THREE.MathUtils.degToRad(side * -13)
    return { shoulder, elbow }
  }
  const armL = makeArm(-1)
  const armR = makeArm(1)

  // ── HEAD ───────────────────────────────────────────────────────────────────
  // Deliberately oversized (nearly half his height). Big head + small body is the
  // single strongest "this is a character, not a person" cue.
  const head = at(new THREE.Group(), 0, 1.58, 0)

  const skull = at(ball(0.46, M.coat, { y: 0.94, z: 0.95 }), 0, 0.24, 0)
  const muzzle = at(ball(0.235, M.belly, { x: 1.05, y: 0.85, z: 0.92 }), 0, 0.08, 0.31)
  const cheekL = at(ball(0.175, M.belly, { z: 0.8 }), -0.18, 0.05, 0.25)
  const cheekR = at(ball(0.175, M.belly, { z: 0.8 }), 0.18, 0.05, 0.25)
  // Small, and sat high on the muzzle. A big nose in the middle of the muzzle
  // reads as a hole in his face rather than a nose.
  const nose = at(ball(0.072, M.nose, { y: 0.85, z: 0.8 }), 0, 0.19, 0.5)

  // Eyes: dark ball + a small unlit white ball for the catchlight. That highlight
  // is doing a lot of work — without it the eyes look dead.
  // Each eye is a group sitting AT the eyeball, with its parts at the group's
  // own origin. That's what lets update() blink by squashing scale.y: scaling a
  // group whose children are offset would slide the eyes down the face instead
  // of closing them.
  const eye = (side) => {
    const socket = at(new THREE.Group(), side * 0.195, 0.33, 0.39)
    socket.add(
      ball(0.11, M.eye),
      at(ball(0.038, M.shine), side * 0.04, 0.045, 0.065)
    )
    return socket
  }
  const eyeL = eye(-1)
  const eyeR = eye(1)
  const eyes = group(eyeL, eyeR)
  // The eyeballs are already solid dark; an outline on them — and especially on
  // the tiny catchlights — just turns the whole eye into one black blob.
  eyes.traverse((o) => { o.userData.noOutline = true })

  // Brows are just thin rounded boxes, but tilting them is what sets his mood.
  const browL = spin(at(box(0.18, 0.04, 0.06, M.nose, 0.015), -0.2, 0.48, 0.36), 0, 0, 9)
  const browR = spin(at(box(0.18, 0.04, 0.06, M.nose, 0.015), 0.2, 0.48, 0.36), 0, 0, -9)

  // Ears: spheres squashed front-to-back (scale.z) so they stay as readable round
  // discs when you look at him head-on, with a smaller pink one set just in front.
  const ear = (side) => group(
    at(ball(0.13, M.coat, { z: 0.72 }), side * 0.35, 0.54, -0.02),
    at(ball(0.075, M.inner, { z: 0.5 }), side * 0.35, 0.54, 0.035)
  )

  // Whiskers: very thin cylinders fanned out from the muzzle. Flagged noOutline —
  // an outline on something this thin would swallow the whisker whole.
  const whisker = (side, i) => {
    const w = at(tube(0.005, 0.007, 0.34, M.nose, 5), side * 0.33, 0.14 - i * 0.07, 0.36)
    spin(w, 0, 0, -side * (74 + i * 10)) // negative Z-rotation swings +Y towards +X, so negate for the left side
    w.userData.noOutline = true
    return w
  }
  const whiskers = group(whisker(-1, 0), whisker(-1, 1), whisker(1, 0), whisker(1, 1))

  head.add(skull, muzzle, cheekL, cheekR, nose, eyes, browL, browR, ear(-1), ear(1), whiskers)

  // ── TAIL ───────────────────────────────────────────────────────────────────
  // An otter's rudder tail: thick where it leaves the rump, tapering to a point,
  // and drooping in a curve. A single cone can't curve, so instead it's a short
  // CHAIN of shrinking spheres — each one parented to the last and bent a few
  // more degrees down. Bend a little at every joint and the whole thing arcs,
  // exactly like the pivots used for the arms and legs.
  const tail = at(new THREE.Group(), 0, 0.8, -0.26)
  spin(tail, -96, 0, 0)   // leaves the body roughly level, just dipping
  tail.scale.x = 0.8      // flattened side-to-side, like the real animal

  let link = tail
  const segments = [0.21, 0.175, 0.14, 0.105, 0.075]
  segments.forEach((radius, i) => {
    const joint = new THREE.Group()
    if (i > 0) {
      joint.position.y = segments[i - 1] * 0.85            // step along the tail
      joint.rotation.x = THREE.MathUtils.degToRad(-15)     // and bend a bit further down
    }
    joint.add(ball(radius, M.coat))
    link.add(joint)
    link = joint
  })

  // ── ATTACHMENT SLOTS ───────────────────────────────────────────────────────
  // Empty markers. Accessories get parented to these, so a hat follows the head
  // when it tilts and a compass follows the paw when the arm swings — the prop
  // never has to know anything about the animation.
  const slots = {
    head: at(new THREE.Group(), 0, 0.55, 0),     // where a hat band sits, not the very crown
    face: at(new THREE.Group(), 0, 0.33, 0.52),  // just clear of the eyeballs, which bulge to z 0.5
    neck: at(new THREE.Group(), 0, 1.52, 0),
    chest: at(new THREE.Group(), 0, 1.36, 0.26),
    back: at(new THREE.Group(), 0, 1.2, -0.32),
    waist: at(new THREE.Group(), 0, 0.98, 0),
    // Just below and in front of the paw, not inside it — a prop parented at the
    // paw's own centre simply disappears inside the paw. These hang off the
    // ELBOW, not the shoulder, so a held compass follows the forearm.
    handL: at(new THREE.Group(), 0, -0.42, 0.1),
    handR: at(new THREE.Group(), 0, -0.42, 0.1)
  }
  head.add(slots.head, slots.face)
  armL.elbow.add(slots.handL)
  armR.elbow.add(slots.handR)

  // ── THE SPINE ──────────────────────────────────────────────────────────────
  // Everything from the waist up goes in one group so it can twist against the
  // legs — shoulders rotating one way while the hips go the other is most of
  // what separates "walking" from "two legs moving". Rotating about Y works
  // from a group sitting at the origin because the spine runs through x=0,z=0
  // at every height, so no awkward re-measuring of child positions was needed.
  const upper = new THREE.Group()
  upper.add(belly, chest, collar, bib, beltLoop, buckle, armL.shoulder, armR.shoulder, head,
    slots.neck, slots.chest, slots.back, slots.waist)

  // Legs, hips and tail stay on the root: they belong to the lower body and must
  // not inherit the shoulder twist.
  root.add(legL.hip, legR.hip, hips, upper, tail)

  // ── GROUND SHADOW ──────────────────────────────────────────────────────────
  // Not a real shadow (those need extra render passes) — just a dark translucent
  // disc on the floor. It's the cheapest possible way to stop him looking like
  // he's hovering, which matters a lot on a tilted 3D map.
  if (shadow) {
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 24),
      // depthWrite: false stops the disc from blocking things drawn after it.
      new THREE.MeshBasicMaterial({ color: 0x1a1208, transparent: true, opacity: 0.26, depthWrite: false })
    )
    spin(at(blob, 0, 0.01, 0.02), -90, 0, 0)
    blob.scale.set(1, 0.85, 1)
    blob.userData.noOutline = true
    root.add(blob)
  }

  // Outline the body now, once. Accessories get outlined separately each time
  // they're built, down in applyOutfit().
  if (outline) outlineAll(root)

  // ── WEARING AN OUTFIT ──────────────────────────────────────────────────────
  // Three independent choices: the kit (body clothes + carried gear), the hat,
  // and the eyewear. They're kept separate so any hat goes with any kit; the
  // outfit only *suggests* a hat the first time you pick it (see applyOutfit).
  let currentOutfit = outfit
  let currentHat = hat
  let currentEyewear = eyewear
  // Where the arms sit when he's standing still. Set by whatever he's holding,
  // and used below as the centre line the walk cycle swings around.
  const restArm = { L: 0, R: 0 }

  function applyOutfit(name) {
    const kit = getOutfit(name)
    currentOutfit = OUTFITS[name] ? name : 'zoot'  // getOutfit() falls back to the house kit, so record what we actually put on

    // 1. Repaint the clothes that are part of the body itself.
    M.shirt.color.set(kit.colors.shirt)
    M.pants.color.set(kit.colors.pants)
    M.boots.color.set(kit.colors.boots)
    M.belt.color.set(kit.colors.belt)
    M.beltDark.color.set(kit.colors.beltDark ?? kit.colors.belt)
    M.metal.color.set(kit.colors.metal)

    // 2. Clear whatever was being worn, then build the new props into their slots.
    for (const slot of Object.values(slots)) disposeChildren(slot)
    restArm.L = 0
    restArm.R = 0
    for (const key of kit.accessories) {
      const asset = ACCESSORIES[key]
      if (!asset) { console.warn(`[traveller] unknown accessory "${key}"`); continue }
      const prop = asset.build(kit.colors)
      if (outline) outlineAll(prop, 0.05)
      slots[asset.slot].add(prop)

      // 3. A held prop can ask its arm to take a pose (see `arm` in ACCESSORIES):
      //    a compass wants the arm out front, a walking stick wants it by his side.
      if (asset.arm != null) {
        if (asset.slot === 'handR') restArm.R = THREE.MathUtils.degToRad(asset.arm)
        if (asset.slot === 'handL') restArm.L = THREE.MathUtils.degToRad(asset.arm)
      }
    }
    armR.shoulder.rotation.x = restArm.R
    armL.shoulder.rotation.x = restArm.L

    // The head and face slots belong to the hat/eyewear pickers, not the kit —
    // the loop above just wiped them, so put them back.
    applyHat(currentHat)
    applyEyewear(currentEyewear)
  }

  // Hat and eyewear share one tiny routine: clear the slot, build the new thing
  // into it (unless it's 'none', which has no build at all), outline it.
  function wear(slot, asset, colors) {
    disposeChildren(slot)
    if (!asset?.build) return
    const prop = asset.build(colors)
    if (outline) outlineAll(prop, 0.05)
    slot.add(prop)
  }

  function applyHat(name) {
    currentHat = HATS[name] ? name : 'none'
    wear(slots.head, getHat(currentHat), getOutfit(currentOutfit).colors)
  }

  function applyEyewear(name) {
    currentEyewear = EYEWEAR[name] ? name : 'none'
    wear(slots.face, getEyewear(currentEyewear), getOutfit(currentOutfit).colors)
  }

  applyOutfit(outfit)

  // ── ANIMATION ──────────────────────────────────────────────────────────────
  // A walk is built from one number: `phase`, the position in the stride, which
  // every limb reads at a different offset. Two things make it look alive
  // rather than mechanical:
  //
  //  1. NOTHING SNAPS. `gait` eases between 0 (standing) and 1 (walking), and
  //     every amplitude is multiplied by it, so starting and stopping is a
  //     fade rather than a switch. `phase` only advances while he's walking, so
  //     he resumes the stride he was in instead of teleporting into a new one.
  //  2. JOINTS LAG. The ankle counter-rotates against the hip, the forearm
  //     trails the upper arm, and the head counter-twists against the shoulders.
  //     Real bodies don't move as one rigid piece, and those three offsets are
  //     most of the difference.

  const STRIDE_HZ = 0.95   // full left-right cycles per second — an unhurried walk
  let lastTime = 0
  let gait = 0             // eased 0→1; how much of the walk is mixed in
  let phase = 0            // where we are in the stride, in radians
  let nextBlink = 2        // seconds until the next blink
  let blinkStart = -1

  function update(time, moving = false) {
    // Clamp dt: switching browser tabs can hand us a multi-second jump, which
    // would fling every limb across its whole range in one frame.
    const dt = Math.min(0.05, Math.max(0, time - lastTime))
    lastTime = time

    // Ease towards walking/standing. The 8 is roughly "most of the way there in
    // a sixth of a second" — quick enough to feel responsive, slow enough to see.
    gait += ((moving ? 1 : 0) - gait) * Math.min(1, dt * 8)
    const idle = 1 - gait

    phase += dt * STRIDE_HZ * Math.PI * 2 * gait
    if (phase > Math.PI * 2) phase -= Math.PI * 2
    const swing = Math.sin(phase)

    // ── legs ────────────────────────────────────────────────────────────────
    // Positive rotation.x swings a limb backwards (it hangs along -Y), so the
    // two legs take opposite signs and are always half a cycle apart.
    legL.hip.rotation.x = swing * 0.5 * gait
    legR.hip.rotation.x = -swing * 0.5 * gait
    // The ankle gives back about half of what the hip took, so the sole stays
    // near level instead of pointing wherever the thigh points.
    legL.foot.rotation.x = -swing * 0.26 * gait
    legR.foot.rotation.x = swing * 0.26 * gait

    // ── arms ────────────────────────────────────────────────────────────────
    // Opposite to the leg on the same side — left arm forward as the left leg
    // goes back — swinging around whatever rest pose the held prop asked for.
    armL.shoulder.rotation.x = restArm.L - swing * 0.38 * gait
    armR.shoulder.rotation.x = restArm.R + swing * 0.38 * gait
    // Elbows stay a little bent and tighten on the forward swing, a quarter of
    // a cycle behind the shoulder. Arms that stay ruler-straight read as a doll.
    armL.elbow.rotation.x = -(0.1 + 0.22 * (0.5 + 0.5 * Math.sin(phase - 0.9))) * gait
    armR.elbow.rotation.x = -(0.1 + 0.22 * (0.5 - 0.5 * Math.sin(phase - 0.9))) * gait

    // ── body ────────────────────────────────────────────────────────────────
    // Shoulders twist against the hips, and the torso leans over whichever leg
    // is carrying the weight.
    upper.rotation.y = -swing * 0.13 * gait
    upper.rotation.z = -swing * 0.045 * gait
    upper.position.x = swing * 0.03 * gait
    // Breathing while still, which fades out as the walk takes over.
    upper.position.y = Math.sin(time * 1.6) * 0.012 * idle

    // Two bounces per cycle — one per footfall — highest as the legs pass each
    // other, lowest at full stride. cos(2·phase) does that for free.
    const bounce = Math.cos(phase * 2) * 0.5 + 0.5
    root.position.y = (bounce - 0.5) * 0.06 * gait + Math.sin(time * 2.2) * 0.02 * idle

    // ── head ────────────────────────────────────────────────────────────────
    // Counter-twist so he keeps looking where he's going while his shoulders
    // rotate underneath him, plus an idle glance around when standing.
    head.rotation.y = -upper.rotation.y * 0.75 + Math.sin(time * 0.6) * 0.09 * idle
    head.rotation.z = Math.sin(time * 0.9) * 0.035 * idle - upper.rotation.z * 0.5
    head.rotation.x = -0.03 * gait   // leans into the walk a touch

    // ── tail ────────────────────────────────────────────────────────────────
    // Swings against the shoulder twist (that's what a tail is for), and keeps
    // a slow idle flick when he's standing.
    tail.rotation.z = swing * 0.22 * gait + Math.sin(time * 1.7) * 0.16 * idle
    tail.rotation.y = -upper.rotation.y * 1.2 + Math.sin(time * 1.1) * 0.1 * idle

    // ── blinking ────────────────────────────────────────────────────────────
    // Cheap, and does more for "alive" than any amount of limb work. A blink is
    // a 130 ms squash of the eye groups, every few seconds at an uneven spacing
    // so it never reads as a metronome.
    if (time >= nextBlink) {
      blinkStart = time
      nextBlink = time + 2.5 + Math.random() * 4
    }
    const bt = (time - blinkStart) / 0.13
    // |cos| runs 1 → 0 → 1 over the blink: open, shut, open.
    const lid = bt >= 0 && bt <= 1 ? Math.max(0.05, Math.abs(Math.cos(bt * Math.PI))) : 1
    eyeL.scale.y = lid
    eyeR.scale.y = lid
  }

  // ── THE PUBLIC API ─────────────────────────────────────────────────────────
  return {
    group: root,
    parts: { head, upper, tail, armL, armR, legL, legR, eyeL, eyeR, slots },  // exposed so you can pose him by hand
    materials: M,

    /** Swap the whole kit: 'zoot' | 'explorer' | 'island' | 'city' | 'rain' | 'ranger' */
    setOutfit: (name) => applyOutfit(name),
    /** Headgear: 'none' | 'cap' | 'bucket' | 'sunHat' | 'beanie' | 'bandana' | 'hood' */
    setHat: (name) => applyHat(name),
    /** Eyewear: 'none' | 'sunglasses' | 'aviators' | 'goggles' | 'specs' */
    setEyewear: (name) => applyEyewear(name),
    get hat() { return currentHat },
    get eyewear() { return currentEyewear },

    /** Recolour the animal: 'zoot' | 'otter' | 'cocoa' | 'sand' | 'slate' | 'fox' */
    setFur: (name) => {
      const f = getFur(name)
      M.coat.color.set(f.coat)
      M.belly.color.set(f.belly)
      M.inner.color.set(f.inner ?? PALETTE.inner)
      M.nose.color.set(f.markings ?? PALETTE.noseDark)
    },
    /** Which way he faces, in compass degrees (0 = north, 90 = east). */
    setBearing: (deg) => { root.rotation.y = THREE.MathUtils.degToRad(180 - deg) },
    /** Call every frame. `time` in seconds; `moving` true to make him walk. */
    update,
    get outfit() { return currentOutfit },
    /** Free every bit of GPU memory he's holding. Call when tearing the scene down. */
    dispose: () => {
      root.traverse((o) => {
        if (!o.isMesh) return
        o.geometry.dispose()
        if (o.material !== OUTLINE_MAT) o.material.dispose()
      })
      root.removeFromParent()
    }
  }
}
