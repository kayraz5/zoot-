<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { getPlaceImages } from '../../model/services/placeImages.js'
import PlaceArt from './PlaceArt.vue'

/**
 * Photo strip for a mission stop: 1–3 swipeable photos of the place; tap one to open it full screen.
 * Falls back to the procedural PlaceArt poster while loading fails or when Commons has nothing.
 */
const props = defineProps({ place: { type: Object, required: true }, height: { type: Number, default: 180 } })

const images = ref([])
const loading = ref(true)
const active = ref(0) // slide showing in the strip
const open = ref(-1) // slide showing in the lightbox, -1 = closed
const strip = ref(null)
const closeBtn = ref(null)

watch(() => props.place?.id, async () => {
  loading.value = true
  images.value = []
  active.value = 0
  images.value = await getPlaceImages(props.place)
  loading.value = false
}, { immediate: true })

function onScroll() {
  const el = strip.value
  if (el) active.value = Math.round(el.scrollLeft / el.clientWidth)
}
function goTo(i) {
  strip.value?.scrollTo({ left: i * strip.value.clientWidth, behavior: 'smooth' })
}

async function show(i) {
  open.value = i
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
  await nextTick()
  closeBtn.value?.focus()
}
function close() {
  if (open.value < 0) return
  goTo(open.value) // leave the strip on the photo they were last looking at
  open.value = -1
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
}
function step(d) {
  const n = images.value.length
  open.value = (open.value + d + n) % n
}
function onKey(e) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') step(1)
  else if (e.key === 'ArrowLeft') step(-1)
}

// Swipe left/right inside the lightbox.
let touchX = null
const onTouchStart = (e) => { touchX = e.touches[0].clientX }
function onTouchEnd(e) {
  if (touchX === null) return
  const dx = e.changedTouches[0].clientX - touchX
  if (Math.abs(dx) > 40 && images.value.length > 1) step(dx < 0 ? 1 : -1)
  touchX = null
}

onBeforeUnmount(close)
</script>

<template>
  <div class="gallery" :style="{ '--h': height + 'px' }">
    <div v-if="loading" class="skeleton" aria-hidden="true"></div>

    <PlaceArt v-else-if="!images.length" :place="place" :height="height" />

    <template v-else>
      <div ref="strip" class="strip" @scroll.passive="onScroll">
        <button v-for="(img, i) in images" :key="img.src" type="button" class="slide" @click="show(i)"
          :aria-label="`Enlarge photo ${i + 1} of ${images.length} of ${place.name}`">
          <img :src="img.src" :alt="img.alt" loading="lazy" />
        </button>
      </div>
      <span class="hint" aria-hidden="true"><i class="bi bi-arrows-angle-expand"></i></span>
      <span class="area-tag">{{ place.area }}</span>
      <div v-if="images.length > 1" class="dots">
        <button v-for="(img, i) in images" :key="img.src" type="button" :class="{ on: i === active }" @click="goTo(i)"
          :aria-label="`Show photo ${i + 1}`" :aria-current="i === active"></button>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="open >= 0" class="lightbox" role="dialog" aria-modal="true" :aria-label="`${place.name} photos`"
        @click.self="close" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
        <button ref="closeBtn" type="button" class="lb-btn lb-close" @click="close" aria-label="Close"><i class="bi bi-x-lg"></i></button>
        <button v-if="images.length > 1" type="button" class="lb-btn lb-prev" @click="step(-1)" aria-label="Previous photo"><i class="bi bi-chevron-left"></i></button>
        <figure class="lb-figure" @click.self="close">
          <img :key="images[open].full" :src="images[open].full" :alt="images[open].alt" @error="$event.target.src = images[open].src" />
          <figcaption>
            <div class="lb-title">{{ place.name }} <span v-if="images.length > 1" class="lb-count">{{ open + 1 }} / {{ images.length }}</span></div>
            <a :href="images[open].page" target="_blank" rel="noopener" class="lb-credit">
              Photo: {{ images[open].credit }}<template v-if="images[open].license"> · {{ images[open].license }}</template> · Wikimedia Commons
            </a>
          </figcaption>
        </figure>
        <button v-if="images.length > 1" type="button" class="lb-btn lb-next" @click="step(1)" aria-label="Next photo"><i class="bi bi-chevron-right"></i></button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.gallery { position: relative; height: var(--h); border-radius: 14px; overflow: hidden; border: var(--zt-bw) solid var(--zt-line); background: var(--zt-yellow-pale); }
.gallery :deep(.art) { border-radius: 0; }
.skeleton { height: 100%; background: linear-gradient(100deg, var(--zt-yellow-pale) 30%, var(--zt-yellow-soft) 50%, var(--zt-yellow-pale) 70%); background-size: 300% 100%; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

.strip { display: flex; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.strip::-webkit-scrollbar { display: none; }
.slide { flex: 0 0 100%; height: 100%; padding: 0; border: 0; background: none; scroll-snap-align: start; cursor: zoom-in; }
.slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
.slide:focus-visible { outline: 3px solid var(--zt-pink); outline-offset: -3px; }

.hint, .area-tag { position: absolute; pointer-events: none; background: rgba(17, 17, 17, 0.72); color: #fff; font-size: 0.72rem; font-weight: 800; border-radius: 999px; }
.hint { top: 8px; right: 8px; width: 28px; height: 28px; display: grid; place-items: center; }
.area-tag { left: 8px; bottom: 8px; padding: 2px 9px; }
.dots { position: absolute; right: 8px; bottom: 9px; display: flex; gap: 5px; }
.dots button { width: 9px; height: 9px; padding: 0; border-radius: 50%; border: 1.5px solid #111; background: rgba(255, 255, 255, 0.85); }
.dots button.on { background: var(--zt-yellow); width: 20px; border-radius: 999px; }

.lightbox { position: fixed; inset: 0; z-index: 2000; background: rgba(10, 10, 10, 0.92); display: flex; align-items: center; justify-content: center; padding: 56px 12px 16px; }
.lb-figure { margin: 0; max-width: min(1100px, 100%); max-height: 100%; display: flex; flex-direction: column; align-items: center; }
.lb-figure img { max-width: 100%; max-height: calc(100vh - 150px); object-fit: contain; border-radius: 12px; border: 3px solid var(--zt-yellow); background: #222; }
figcaption { margin-top: 10px; text-align: center; color: #fff; }
.lb-title { font-family: var(--zt-font-head); font-weight: 700; }
.lb-count { margin-left: 6px; font-size: 0.8rem; color: var(--zt-yellow); }
.lb-credit { display: block; font-size: 0.72rem; color: rgba(255, 255, 255, 0.7); max-width: 90vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-btn { position: absolute; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #111; background: var(--zt-yellow); color: #111; display: grid; place-items: center; font-size: 1.1rem; box-shadow: 3px 3px 0 #000; }
.lb-close { top: 10px; right: 12px; }
.lb-prev { left: 12px; top: 50%; transform: translateY(-50%); }
.lb-next { right: 12px; top: 50%; transform: translateY(-50%); }
@media (max-width: 575px) {
  .lightbox { padding-bottom: 76px; }
  .lb-figure img { max-height: calc(100vh - 210px); }
  .lb-prev, .lb-next { top: auto; bottom: 16px; transform: none; }
}
</style>
