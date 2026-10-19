<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PassportBook } from '../gl/passportScene.js'
import { drawCover, drawIdentity, drawAreaPage, drawBackPage, PAGE_W, PAGE_H } from '../gl/pageArt.js'
import { AREAS, STYLES } from '../../model/data/origins.js'
import { catalog, loadCatalog } from '../../model/services/catalog.js'
import { usePassportStore } from '../../model/stores/passport.js'
import { useUserStore } from '../../model/stores/user.js'
import { useMissionStore } from '../../model/stores/mission.js'
import { DEFAULT_COVER } from '../../model/services/brand.js'

// 3D passport page: flip through pages and play the slam for newly stamped areas
const passport = usePassportStore()
const user = useUserStore()
const mission = useMissionStore()

const canvas = ref(null)
const spread = ref(0)
const failed = ref(false) // no WebGL, show the text fallback
const busy = ref(false) // animation running, ignore input

let book = null
let otter = null
let dragStartX = null

// Page order: cover, identity, one page per area, badges
const FIRST_AREA_PAGE = 2
const pageCount = AREAS.length + 3
const spreadCount = Math.ceil(pageCount / 2)

// Slam state per area: chop hidden until the stamp hits, then ink fades in
const revealedAreas = new Set()
const inkProgress = {}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function loadOtter() {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      otter = img
      resolve()
    }
    img.onerror = () => resolve() // cover still draws without the logo
    img.src = '/brand/zoot-otter.png'
  })
}

function formatStampDate(iso) {
  return new Date(iso)
    .toLocaleDateString('en-SG', { day: '2-digit', month: 'short', timeZone: 'Asia/Singapore' })
    .toUpperCase()
}

const stampsByPlace = computed(() => {
  const result = {}
  for (const stamp of passport.stamps) {
    result[stamp.place_id] = { date: formatStampDate(stamp.stamped_at) }
  }
  return result
})

const badges = computed(() => {
  const isHawker = (placeId) => catalog.value.find((place) => place.id === placeId)?.tags.includes('hawker')
  const hawkerStamps = passport.stamps.filter((stamp) => isHawker(stamp.place_id)).length
  const active = mission.mission

  return [
    { glyph: '✦', title: 'First Chop', text: 'Stamp any place.', earned: passport.stamps.length >= 1 },
    { glyph: '③', title: 'District Hopper', text: 'Chops from 3 areas.', earned: passport.chopCount >= 3 },
    { glyph: '🍜', title: 'Hawker Hero', text: 'Stamp 2 hawker centres.', earned: hawkerStamps >= 2 },
    { glyph: '☂', title: 'Rain Dancer', text: 'Survive a rain rewrite.', earned: (active?.replans || 0) > 0 },
    { glyph: '✈', title: 'Back to the Gate', text: 'Finish a quest on time.', earned: Boolean(active?.completed) },
    { glyph: '◎', title: 'Codex Explorer', text: 'Discover 20 places.', earned: passport.seen.size >= 20 }
  ]
})

// Draws page i; PassportBook calls this for every page texture
function paint(i, ctx) {
  const left = i % 2 === 1
  const profile = user.profile || {}
  const name = profile.display_name || 'Field Traveller'

  if (i === 0) {
    return drawCover(ctx, { color: profile.cover_color || DEFAULT_COVER, name, otter })
  }

  if (i === 1) {
    return drawIdentity(ctx, {
      name,
      style: STYLES[profile.style]?.label || '—',
      level: user.level.level,
      title: user.title,
      xp: profile.xp || 0,
      stamps: passport.stamps.length,
      chops: passport.chopCount,
      color: profile.cover_color
    })
  }

  const area = AREAS[i - FIRST_AREA_PAGE]
  if (area) {
    const waitingForSlam = passport.pendingSlams.includes(area.id)
    return drawAreaPage(ctx, {
      area,
      places: catalog.value.filter((place) => place.area === area.id),
      stampsByPlace: stampsByPlace.value,
      pageNo: i,
      left,
      revealed: !waitingForSlam || revealedAreas.has(area.id),
      inkProgress: inkProgress[area.id] ?? 1
    })
  }

  return drawBackPage(ctx, { badges: badges.value, left })
}

async function flipTo(targetSpread) {
  if (!book) return
  const settled = book.flipTo(targetSpread)
  spread.value = book.spread
  await settled
}

// Turn to each newly stamped area and slam its chop onto the page
async function playSlams() {
  for (const areaId of [...passport.pendingSlams]) {
    const areaIndex = AREAS.findIndex((a) => a.id === areaId)
    if (areaIndex < 0) {
      passport.consumeSlam(areaId)
      continue
    }

    const page = FIRST_AREA_PAGE + areaIndex
    await flipTo(book.spreadForPage(page))
    await wait(300)
    await book.slam(page, 392, 104, AREAS[areaIndex].ink, () => {
      revealedAreas.add(areaId)
      // Fade the ink in over a few frames
      for (let step = 0; step <= 6; step++) {
        setTimeout(() => {
          inkProgress[areaId] = 0.4 + (step / 6) * 0.6
          book?.repaint(page)
        }, step * 45)
      }
      navigator.vibrate?.(40)
    })
    passport.consumeSlam(areaId)
    await wait(500)
  }
}

onMounted(async () => {
  await loadCatalog()
  try {
    await Promise.all([
      document.fonts.load('700 20px Fredoka'),
      document.fonts.load('800 20px Poppins'),
      document.fonts.load('500 13px Poppins'),
      loadOtter()
    ])
  } catch {}

  try {
    book = new PassportBook(canvas.value, { pageCount, paint, coverColor: user.profile?.cover_color || DEFAULT_COVER })
  } catch (err) {
    console.warn('[passport] WebGL unavailable', err)
    failed.value = true
    return
  }

  busy.value = true
  await wait(500)
  if (passport.pendingSlams.length) await playSlams()
  else await flipTo(1)
  busy.value = false
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  book?.dispose()
  book = null
})

function onKey(e) {
  if (e.key === 'ArrowRight') flipTo(spread.value + 1)
  if (e.key === 'ArrowLeft') flipTo(spread.value - 1)
}

function onPointerDown(e) {
  dragStartX = e.clientX
}

// Swipe to turn, or tap the right/left half
function onPointerUp(e) {
  if (dragStartX == null || busy.value) return
  const dragDistance = e.clientX - dragStartX
  dragStartX = null

  if (Math.abs(dragDistance) > 40) {
    flipTo(spread.value + (dragDistance < 0 ? 1 : -1))
    return
  }
  const rect = canvas.value.getBoundingClientRect()
  const tappedRightHalf = e.clientX - rect.left > rect.width / 2
  flipTo(spread.value + (tappedRightHalf ? 1 : -1))
}

function jumpToArea(areaId) {
  const areaIndex = AREAS.findIndex((a) => a.id === areaId)
  flipTo(book.spreadForPage(FIRST_AREA_PAGE + areaIndex))
}

// Saves the right-hand page of the open spread as a PNG
function savePage() {
  let page = 0
  if (spread.value > 0) {
    const rightPage = spread.value * 2
    page = Math.min(pageCount - 1, rightPage < pageCount ? rightPage : rightPage - 1)
  }

  const pageCanvas = document.createElement('canvas')
  pageCanvas.width = PAGE_W
  pageCanvas.height = PAGE_H
  paint(page, pageCanvas.getContext('2d'))

  const link = document.createElement('a')
  link.download = `zoot-passport-p${page}.png`
  link.href = pageCanvas.toDataURL('image/png')
  link.click()
}

// Text fallback when WebGL isn't available
const stampedAreas = computed(() =>
  AREAS
    .map((area) => ({ ...area, count: (passport.byArea[area.id] || []).length }))
    .filter((area) => area.count > 0)
)
</script>

<template>
  <main class="zt-page">
    <div class="d-flex justify-content-between align-items-end mb-2">
      <div>
        <h1 class="title mb-0">Passport</h1>
        <p class="text-muted small mb-0">{{ passport.stamps.length }} {{ passport.stamps.length === 1 ? 'stamp' : 'stamps' }} · {{ passport.chopCount }} area {{ passport.chopCount === 1 ? 'chop' : 'chops' }}</p>
      </div>
      <button class="btn btn-soft btn-sm" @click="savePage"><i class="bi bi-download"></i> Save page</button>
    </div>

    <div class="stage" :class="{ busy }">
      <canvas v-if="!failed" ref="canvas" @pointerdown="onPointerDown" @pointerup="onPointerUp" aria-label="3D passport. Tap right side for next page, left for previous." role="img"></canvas>
      <div v-else class="fallback p-3">
        <p class="small text-muted">3D is unavailable on this device. Your chops:</p>
        <div v-for="area in stampedAreas" :key="area.id" class="zt-pill me-1 mb-1" :style="{ color: area.ink }">{{ area.glyph }} {{ area.id }} ×{{ area.count }}</div>
        <p v-if="!stampedAreas.length" class="small">No stamps yet.</p>
      </div>
    </div>

    <div class="d-flex justify-content-center align-items-center gap-3 mt-2" v-if="!failed">
      <button class="btn btn-soft" :disabled="busy || spread === 0" @click="flipTo(spread - 1)" aria-label="Previous page"><i class="bi bi-chevron-left"></i></button>
      <span class="small fw-800 mono">{{ spread === 0 ? 'Cover' : `Spread ${spread} / ${spreadCount}` }}</span>
      <button class="btn btn-soft" :disabled="busy || spread >= spreadCount" @click="flipTo(spread + 1)" aria-label="Next page"><i class="bi bi-chevron-right"></i></button>
    </div>

    <div class="zt-section-title"><i class="bi bi-bookmark-star"></i> Jump to a page</div>
    <div class="d-flex flex-wrap gap-2">
      <button v-for="a in AREAS" :key="a.id" class="zt-chip" :disabled="busy || failed" @click="jumpToArea(a.id)">
        <span :style="{ color: a.ink }">{{ a.glyph }}</span> {{ a.id }}
        <span v-if="passport.byArea[a.id]" class="badge rounded-pill text-bg-danger">{{ passport.byArea[a.id].length }}</span>
      </button>
    </div>
    <p v-if="!passport.stamps.length" class="small text-muted mt-3">
      No chops yet. Walk into a stop’s ring on the <RouterLink to="/map">map</RouterLink> and tap Stamp.
    </p>
  </main>
</template>

<style scoped>
.title { font-size: 2.4rem; }
.stage {
  position: relative; width: 100%; aspect-ratio: 4 / 3.3; max-height: 62vh; border-radius: 24px; overflow: hidden;
  border: var(--zt-bw) solid var(--zt-line); box-shadow: var(--zt-shadow);
  background-color: var(--zt-yellow);
  background-image: repeating-conic-gradient(from 0deg at 50% 55%, rgba(255, 255, 255, 0.32) 0deg 9deg, rgba(255, 255, 255, 0) 9deg 18deg);
}
[data-bs-theme='dark'] .stage { background-color: #1b1b1b; background-image: repeating-conic-gradient(from 0deg at 50% 55%, rgba(255, 204, 0, 0.1) 0deg 9deg, rgba(255, 204, 0, 0) 9deg 18deg); }
.stage canvas { width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: pointer; }
.stage.busy canvas { cursor: progress; }
</style>
