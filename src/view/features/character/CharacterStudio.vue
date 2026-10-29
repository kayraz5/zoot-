<script setup>
// ─────────────────────────────────────────────────────────────────────────────
//  CharacterStudio.vue — the dressing room, as a reusable component
// ─────────────────────────────────────────────────────────────────────────────
//  A live 3D traveller you can spin, plus the outfit/fur/pose pickers.
//
//  It owns NO saved state. The chosen outfit and fur come in as props and go
//  back out as events (the v-model pattern), so the same component serves two
//  different jobs without knowing about either of them:
//    - the Character tab in ProfileView, where a Save button commits to the store
//    - /wardrobe, a throwaway playground for trying things while editing the assets
//
//  This file is the only place the 3D preview exists. It's imported lazily by
//  ProfileView so Three.js is never downloaded by someone who doesn't open the
//  tab — see defineAsyncComponent there.
// ─────────────────────────────────────────────────────────────────────────────
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { createTraveller } from './traveller.js'
import { EYEWEAR, FURS, HATS, OUTFITS } from './travellerAssets.js'

const props = defineProps({
  outfit: { type: String, default: 'zoot' },
  fur: { type: String, default: 'zoot' },
  hat: { type: String, default: 'cap' },
  eyewear: { type: String, default: 'none' },
  height: { type: String, default: 'min(52dvh, 420px)' }
})
const emit = defineEmits(['update:outfit', 'update:fur', 'update:hat', 'update:eyewear'])

// Both lists are read straight from the asset file, so anything you add in
// travellerAssets.js shows up here with no edit to this component.
const outfits = Object.entries(OUTFITS).map(([key, o]) => ({ key, label: o.label }))
const furs = Object.entries(FURS).map(([key, f]) => ({ key, label: f.label }))
const hats = Object.entries(HATS).map(([key, h]) => ({ key, label: h.label }))
const eyewears = Object.entries(EYEWEAR).map(([key, e]) => ({ key, label: e.label }))

// Picking an outfit also moves the hat/eyewear pickers to whatever that kit
// suggests — so Island Hopper arrives with its sun hat on — but only as a
// starting point: the two rows below stay yours to change afterwards.
function chooseOutfit(key) {
  emit('update:outfit', key)
  const kit = OUTFITS[key]
  if (kit?.hat) emit('update:hat', kit.hat)
  if (kit?.eyewear) emit('update:eyewear', kit.eyewear)
}

const walking = ref(false)
const canvas = ref(null)
let traveller = null
let renderer = null
let frame = 0

// Props are the source of truth, so re-apply whenever the parent changes them —
// including when the parent reverts a change the user didn't save.
watch(() => props.outfit, (v) => {
  // setOutfit() rebuilds every slot, head and face included, so the hat and
  // glasses must be re-applied after it or they'd vanish on an outfit change.
  traveller?.setOutfit(v)
  traveller?.setHat(props.hat)
  traveller?.setEyewear(props.eyewear)
})
watch(() => props.fur, (v) => traveller?.setFur(v))
watch(() => props.hat, (v) => traveller?.setHat(v))
watch(() => props.eyewear, (v) => traveller?.setEyewear(v))

onMounted(() => {
  // alpha: true leaves the canvas transparent so the card behind it shows through.
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  // The same three lights the map layer uses, so what you pick here is exactly
  // what you get out on the map.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd2a8, 2.0))
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.4); sun.position.set(3, 6, 4); scene.add(sun)
  const rim = new THREE.DirectionalLight(0xcfe3ff, 0.8); rim.position.set(-3, 2, -4); scene.add(rim)

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)

  traveller = createTraveller({ outfit: props.outfit, fur: props.fur, hat: props.hat, eyewear: props.eyewear })
  let bearing = 195 // facing you, turned slightly so he reads as 3D rather than flat
  traveller.setBearing(bearing)
  scene.add(traveller.group)

  // Keep the drawing buffer matching the element's CSS size. Without this the
  // render stretches on resize, because those are two different things.
  function resize() {
    const el = canvas.value
    if (!el || !el.clientWidth) return
    renderer.setSize(el.clientWidth, el.clientHeight, false)
    camera.aspect = el.clientWidth / el.clientHeight
    // Framed for the TALLEST outfit — the monsoon umbrella reaches about y 2.9,
    // well above his own 2.25, and a camera framed on just the body crops it.
    camera.position.set(0, 1.7, 6.2)
    camera.lookAt(0, 1.35, 0)
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  // Drag to spin. Pointer events cover mouse and touch in one handler; capture
  // keeps the drag alive when the finger slides off the canvas.
  let dragging = false
  let lastX = 0
  const down = (e) => { dragging = true; lastX = e.clientX; canvas.value.setPointerCapture?.(e.pointerId) }
  const move = (e) => {
    if (!dragging) return
    bearing = (bearing - (e.clientX - lastX) * 0.6 + 360) % 360
    lastX = e.clientX
    traveller.setBearing(bearing)
  }
  const up = () => { dragging = false }
  canvas.value.addEventListener('pointerdown', down)
  canvas.value.addEventListener('pointermove', move)
  canvas.value.addEventListener('pointerup', up)
  canvas.value.addEventListener('pointercancel', up)

  // performance.now() rather than THREE.Clock — Clock is deprecated as of
  // three r186, and this matches how travellerLayer.js already times him.
  const start = performance.now()
  function loop() {
    traveller.update((performance.now() - start) / 1000, walking.value)
    renderer.render(scene, camera)
    frame = requestAnimationFrame(loop)
  }
  loop()

  onUnmounted(() => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    traveller.dispose()
    renderer.dispose()
  })
})
</script>

<template>
  <div class="studio">
    <canvas ref="canvas" class="stage" :style="{ height }"></canvas>

    <div class="rack">
      <div class="rack-row">
        <span class="rack-label">Outfit</span>
        <div class="rack-opts">
          <button
            v-for="o in outfits"
            :key="o.key"
            class="zt-chip"
            :class="{ active: outfit === o.key }"
            :aria-pressed="outfit === o.key"
            @click="chooseOutfit(o.key)"
          >{{ o.label }}</button>
        </div>
      </div>

      <div class="rack-row">
        <span class="rack-label">Hat</span>
        <div class="rack-opts">
          <button
            v-for="h in hats"
            :key="h.key"
            class="zt-chip"
            :class="{ active: hat === h.key }"
            :aria-pressed="hat === h.key"
            @click="emit('update:hat', h.key)"
          >{{ h.label }}</button>
        </div>
      </div>

      <div class="rack-row">
        <span class="rack-label">Eyewear</span>
        <div class="rack-opts">
          <button
            v-for="e in eyewears"
            :key="e.key"
            class="zt-chip"
            :class="{ active: eyewear === e.key }"
            :aria-pressed="eyewear === e.key"
            @click="emit('update:eyewear', e.key)"
          >{{ e.label }}</button>
        </div>
      </div>

      <div class="rack-row">
        <span class="rack-label">Fur</span>
        <div class="rack-opts">
          <button
            v-for="f in furs"
            :key="f.key"
            class="zt-chip"
            :class="{ active: fur === f.key }"
            :aria-pressed="fur === f.key"
            @click="emit('update:fur', f.key)"
          >{{ f.label }}</button>
        </div>
      </div>

      <div class="rack-row">
        <span class="rack-label">Pose</span>
        <div class="rack-opts">
          <button class="zt-chip" :class="{ active: walking }" :aria-pressed="walking" @click="walking = !walking">
            <i class="bi" :class="walking ? 'bi-person-walking' : 'bi-person-standing'"></i>
            {{ walking ? 'Walking' : 'Standing' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Lets the parent drop its own buttons under the pickers (the Me tab puts
         Save / Reset here; /wardrobe puts nothing). -->
    <slot name="actions" />
  </div>
</template>

<style scoped>
.stage {
  display: block;
  width: 100%;
  border: var(--zt-bw) solid var(--zt-line);
  border-radius: var(--zt-radius);
  background: var(--zt-card);
  touch-action: none; /* the drag-to-spin handler owns horizontal drags */
  cursor: grab;
}
.stage:active { cursor: grabbing; }

.rack { display: grid; gap: 0.6rem; margin-top: 0.9rem; }
.rack-row { display: flex; align-items: baseline; gap: 0.5rem; }
.rack-label {
  font-family: var(--zt-font-head);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--zt-muted);
  flex: 0 0 4.2rem;
  padding-top: 0.35rem;
}
.rack-opts { display: flex; flex-wrap: wrap; gap: 0.35rem; }
</style>
