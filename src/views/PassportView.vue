<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PassportBook } from '../gl/passportScene.js'
import { drawCover, drawIdentity, drawAreaPage, drawBackPage } from '../gl/pageArt.js'
import { AREAS, STYLES } from '../data/origins.js'
import { catalog, loadCatalog } from '../lib/catalog.js'
import { usePassportStore } from '../stores/passport.js'
import { useUserStore } from '../stores/user.js'
import { useMissionStore } from '../stores/mission.js'
import { DEFAULT_COVER } from '../lib/brand.js'

/** 3D flip passport with chop slams for newly stamped areas (Shrey's lane). */
const passport = usePassportStore()
const user = useUserStore()
const mission = useMissionStore()
const canvas = ref(null)
const spread = ref(0)
const failed = ref(false)
const busy = ref(false)
let book = null
let otter = null // brand mark for the cover, loaded once

function loadOtter() {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => { otter = img; resolve() }
    img.onerror = () => resolve() // the cover still draws without it
    img.src = '/brand/zoot-otter.png'
  })
}
let dragX = null

const FIRST_AREA_PAGE = 2
const pageCount = AREAS.length + 3 // cover, identity, areas…, badges
const revealed = new Set()
const ink = {}

const stampsByPlace = computed(() => {
  const out = {}
  for (const s of passport.stamps) {
    const d = new Date(s.stamped_at)
    out[s.place_id] = { date: d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', timeZone: 'Asia/Singapore' }).toUpperCase() }
  }
  return out
})

const badges = computed(() => {
  const hawkers = passport.stamps.filter((s) => catalog.value.find((p) => p.id === s.place_id)?.tags.includes('hawker')).length
  return [
    { glyph: '✦', title: 'First Chop', text: 'Stamp any place.', earned: passport.stamps.length >= 1 },
    { glyph: '③', title: 'District Hopper', text: 'Chops from 3 areas.', earned: passport.chopCount >= 3 },
    { glyph: '🍜', title: 'Hawker Hero', text: 'Stamp 2 hawker centres.', earned: hawkers >= 2 },
    { glyph: '☂', title: 'Rain Dancer', text: 'Survive a rain rewrite.', earned: (mission.mission?.replans || 0) > 0 },
    { glyph: '✈', title: 'Back to the Gate', text: 'Finish a quest on time.', earned: Boolean(mission.mission?.completed) },
    { glyph: '◎', title: 'Codex Explorer', text: 'Discover 20 places.', earned: passport.seen.size >= 20 }
  ]
})

function paint(i, ctx) {
  const left = i % 2 === 1
  const p = user.profile || {}
  if (i === 0) return drawCover(ctx, { color: p.cover_color || DEFAULT_COVER, name: p.display_name || 'Field Traveller', otter })
  if (i === 1) {
    return drawIdentity(ctx, {
      name: p.display_name || 'Field Traveller', style: STYLES[p.style]?.label || '—', level: user.level.level,
      title: user.title, xp: p.xp || 0, stamps: passport.stamps.length, chops: passport.chopCount, color: p.cover_color
    })
  }
  const areaIdx = i - FIRST_AREA_PAGE
  if (areaIdx >= 0 && areaIdx < AREAS.length) {
    const area = AREAS[areaIdx]
    const pending = passport.pendingSlams.includes(area.id)
    return drawAreaPage(ctx, {
      area, places: catalog.value.filter((pl) => pl.area === area.id), stampsByPlace: stampsByPlace.value,
      pageNo: i, left, revealed: !pending || revealed.has(area.id), inkProgress: ink[area.id] ?? 1
    })
  }
  return drawBackPage(ctx, { badges: badges.value, left })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function playSlams() {
  for (const areaId of [...passport.pendingSlams]) {
    const idx = AREAS.findIndex((a) => a.id === areaId)
    if (idx < 0) { passport.consumeSlam(areaId); continue }
    const page = FIRST_AREA_PAGE + idx
    await go(book.spreadForPage(page))
    await wait(300)
    await book.slam(page, 392, 104, AREAS[idx].ink, () => {
      revealed.add(areaId)
      for (let k = 0; k <= 6; k++) {
        setTimeout(() => {
          ink[areaId] = 0.4 + (k / 6) * 0.6
          book?.repaint(page)
        }, k * 45)
      }
      navigator.vibrate?.(40)
    })
    passport.consumeSlam(areaId)
    await wait(500)
  }
}

async function go(k) {
  if (!book) return
  const p = book.flipTo(k)
  spread.value = book.spread
  await p
}

onMounted(async () => {
  await loadCatalog()
  try {
    await Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('800 20px Poppins'), document.fonts.load('500 13px Poppins'), loadOtter()])
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
  else await go(1)
  busy.value = false
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  book?.dispose()
  book = null
})

function onKey(e) {
  if (e.key === 'ArrowRight') go(spread.value + 1)
  if (e.key === 'ArrowLeft') go(spread.value - 1)
}
function onDown(e) { dragX = e.clientX }
function onUp(e) {
  if (dragX == null || busy.value) return
  const dx = e.clientX - dragX
  dragX = null
  if (Math.abs(dx) > 40) return go(spread.value + (dx < 0 ? 1 : -1))
  const r = canvas.value.getBoundingClientRect()
  go(spread.value + (e.clientX - r.left > r.width / 2 ? 1 : -1))
}

function jump(areaId) {
  go(book.spreadForPage(FIRST_AREA_PAGE + AREAS.findIndex((a) => a.id === areaId)))
}

function savePage() {
  const k = spread.value
  const idx = Math.min(pageCount - 1, k === 0 ? 0 : k * 2 - 1 + (k * 2 < pageCount ? 1 : 0))
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 716
  paint(idx, c.getContext('2d'))
  const a = document.createElement('a')
  a.download = `zoot-passport-p${idx}.png`
  a.href = c.toDataURL('image/png')
  a.click()
}

const areaStats = computed(() => AREAS.map((a) => ({ ...a, n: (passport.byArea[a.id] || []).length })).filter((a) => a.n))
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
      <canvas v-if="!failed" ref="canvas" @pointerdown="onDown" @pointerup="onUp" aria-label="3D passport. Tap right side for next page, left for previous." role="img"></canvas>
      <div v-else class="fallback p-3">
        <p class="small text-muted">3D is unavailable on this device. Your chops:</p>
        <div v-for="a in areaStats" :key="a.id" class="zt-pill me-1 mb-1" :style="{ color: a.ink }">{{ a.glyph }} {{ a.id }} ×{{ a.n }}</div>
        <p v-if="!areaStats.length" class="small">No stamps yet.</p>
      </div>
    </div>

    <div class="d-flex justify-content-center align-items-center gap-3 mt-2" v-if="!failed">
      <button class="btn btn-soft" :disabled="busy || spread === 0" @click="go(spread - 1)" aria-label="Previous page"><i class="bi bi-chevron-left"></i></button>
      <span class="small fw-800 mono">{{ spread === 0 ? 'Cover' : `Spread ${spread} / ${Math.ceil(pageCount / 2)}` }}</span>
      <button class="btn btn-soft" :disabled="busy || spread >= Math.ceil(pageCount / 2)" @click="go(spread + 1)" aria-label="Next page"><i class="bi bi-chevron-right"></i></button>
    </div>

    <div class="zt-section-title"><i class="bi bi-bookmark-star"></i> Jump to a page</div>
    <div class="d-flex flex-wrap gap-2">
      <button v-for="a in AREAS" :key="a.id" class="zt-chip" :disabled="busy || failed" @click="jump(a.id)">
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
