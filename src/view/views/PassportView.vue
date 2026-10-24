<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Flipbook from 'flipbook-vue'
import { StampSlam } from '../gl/stampSlam.js'
import { drawCover, drawIdentity, drawAreaPage, drawBackPage, PAGE_W, PAGE_H } from '../gl/pageArt.js'
import { AREAS, STYLES } from '../../model/data/origins.js'
import { catalog, placeById, loadCatalog } from '../../model/services/catalog.js'
import seedPlaces from '../../model/data/places.sg.json'
import { usePassportStore, CHOP_TARGET } from '../../model/stores/passport.js'
import { useUserStore } from '../../model/stores/user.js'
import { useMissionStore } from '../../model/stores/mission.js'
import { DEFAULT_COVER } from '../../model/services/brand.js'
import { getDb } from '../../model/services/db/index.js'

// Passport page: flipbook-vue turns the pages, and a Three.js stamp slams newly earned area chops
const passport = usePassportStore()
const user = useUserStore()
const mission = useMissionStore()

const stage = ref(null)
const book = ref(null) // the flipbook-vue component
const slamCanvas = ref(null)
const pages = ref([]) // one image (blob: URL) per page
const busy = ref(false) // slam playing, ignore input
const missions = ref([]) // every saved mission, for the mission badges

let stampSlam = null
let otter = null

// Page order: cover, identity, one page per area, badges
const FIRST_AREA_PAGE = 2
const pageCount = AREAS.length + 3
// Leading null: the cover sits alone on the right. Book index = page + 1.
const bookPages = computed(() => [null, ...pages.value])

// Area chops waiting for their slam stay hidden until the stamp lands
const revealedAreas = new Set()
// Places stamped since the passport was last open: their chops stay hidden until their own slam lands
const hiddenStamps = new Set()

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

// Date of each place's first stamp
const stampsByPlace = computed(() => {
  const result = {}
  for (const stamps of Object.values(passport.byArea)) {
    for (const stamp of stamps) result[stamp.place_id] = { date: formatStampDate(stamp.stamped_at) }
  }
  return result
})

// Unstamped places: hand-picked seed places first (in file order), then ones with a Wikipedia article
const seedOrder = new Map(seedPlaces.map((place, i) => [place.id, i]))
const placeRank = (place) => seedOrder.get(place.id) ?? seedPlaces.length + (place.blurb_source === 'wikipedia' ? 0 : 1000)

// An area page's places: stamped ones first (oldest first), then the best-known unstamped ones
function areaPlaces(areaId) {
  const stamped = (passport.byArea[areaId] || []).map((stamp) => placeById.value.get(stamp.place_id)).filter(Boolean)
  const rest = catalog.value
    .filter((place) => place.area === areaId && !passport.stampedIds.has(place.id))
    .sort((a, b) => placeRank(a) - placeRank(b) || a.name.localeCompare(b.name))
  return [...stamped, ...rest]
}

// Pages on the open spread (one on phones)
const openPages = computed(() => {
  const b = book.value
  if (!b) return []
  return [b.showLeftPage && b.leftPage, b.showRightPage && b.rightPage].filter(Boolean).map((index) => index - 1)
})

// Same numbers as printed on the pages (the cover is 0)
const pageLabel = computed(() => {
  const open = openPages.value.filter((page) => page > 0)
  return open.length ? `Page ${open.join('–')} / ${pageCount - 1}` : 'Cover'
})

// Area pages on the open spread, for the "All N places" buttons
const openAreas = computed(() =>
  openPages.value
    .map((page) => AREAS[page - FIRST_AREA_PAGE])
    .filter(Boolean)
    .map((area) => ({ ...area, total: catalog.value.filter((place) => place.area === area.id).length }))
)

const badges = computed(() => {
  const isHawker = (placeId) => placeById.value.get(placeId)?.tags.includes('hawker')
  const hawkerStamps = [...passport.stampedIds].filter(isHawker).length
  // Any mission ever, so these stay earned after starting a new one
  const allMissions = [...missions.value, mission.mission].filter(Boolean)

  return [
    { glyph: '✦', title: 'First Chop', text: 'Stamp any place.', earned: passport.stamps.length >= 1 },
    { glyph: '③', title: 'District Hopper', text: 'Chops from 3 areas.', earned: passport.chopCount >= 3 },
    { glyph: '🍜', title: 'Hawker Hero', text: 'Stamp 2 hawker centres.', earned: hawkerStamps >= 2 },
    { glyph: '☂', title: 'Rain Dancer', text: 'Survive a rain rewrite.', earned: allMissions.some((m) => (m.replans || 0) > 0) },
    { glyph: '✈', title: 'Back to the Gate', text: 'Finish a quest on time.', earned: allMissions.some((m) => m.completed) },
    { glyph: '◎', title: 'Scout', text: 'Discover 20 places.', earned: passport.seen.size >= 20 }
  ]
})

// Draws page i onto a canvas
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
      stamps: passport.stampedIds.size,
      chops: passport.chopCount,
      color: profile.cover_color
    })
  }

  const area = AREAS[i - FIRST_AREA_PAGE]
  if (area) {
    const waitingForSlam = passport.pendingSlams.includes(area.id)
    const shownStamps = Object.fromEntries(Object.entries(stampsByPlace.value).filter(([id]) => !hiddenStamps.has(id)))
    return drawAreaPage(ctx, {
      area,
      places: areaPlaces(area.id),
      stampsByPlace: shownStamps,
      target: CHOP_TARGET,
      pageNo: i,
      left,
      revealed: !waitingForSlam || revealedAreas.has(area.id)
    })
  }

  return drawBackPage(ctx, { badges: badges.value, left })
}

// Short blob: URLs, not data: URLs (flipbook-vue repeats the URL in every curl strip, every frame)
function pageImage(i) {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  paint(i, canvas.getContext('2d'))
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/png'))
}

async function repaintAll() {
  const old = pages.value
  pages.value = await Promise.all(Array.from({ length: pageCount }, (_, i) => pageImage(i)))
  old.forEach((url) => URL.revokeObjectURL(url))
}

async function repaintPage(i) {
  const next = [...pages.value]
  URL.revokeObjectURL(next[i])
  next[i] = await pageImage(i)
  pages.value = next
}

function goToPage(i) {
  const b = book.value
  if (!b) return
  // Two-page spreads start on an even book index; 1 means the cover
  const index = b.displayedPages === 2 ? (i + 1) & ~1 : i + 1
  b.goToPage(index || 1)
}

// Position of canvas pixel (x, y) of page i on the slam canvas, from the page image flipbook-vue shows
function pagePoint(i, x, y) {
  const img = [...stage.value.querySelectorAll('img.page')].find((el) => el.src === pages.value[i])
  if (!img) return null
  const page = img.getBoundingClientRect()
  const box = stage.value.getBoundingClientRect()
  const scale = page.width / PAGE_W
  return { x: page.left - box.left + x * scale, y: page.top - box.top + y * scale, scale }
}

// Turn to each newly earned area and slam its chop onto the page
async function playSlams() {
  for (const areaId of [...passport.pendingSlams]) {
    if (!book.value) return // left the page mid-slam
    const areaIndex = AREAS.findIndex((a) => a.id === areaId)
    if (areaIndex < 0) {
      passport.consumeSlam(areaId)
      continue
    }

    const page = FIRST_AREA_PAGE + areaIndex
    goToPage(page)
    await nextTick()
    await wait(400)
    const at = pagePoint(page, 392, 104)
    const reveal = async () => {
      revealedAreas.add(areaId)
      navigator.vibrate?.(40)
      await repaintPage(page)
    }
    if (stampSlam && at) await stampSlam.slam({ x: at.x, y: at.y, size: 128 * at.scale, ink: AREAS[areaIndex].ink }, reveal)
    else await reveal() // no WebGL: just show the chop
    passport.consumeSlam(areaId)
    await wait(400)
  }
}

// Turn to the place just stamped and slam its chop into its slot
async function playNewStamp(placeId) {
  const place = placeById.value.get(placeId)
  const areaIndex = AREAS.findIndex((a) => a.id === place?.area)
  if (areaIndex < 0) return
  const page = FIRST_AREA_PAGE + areaIndex
  goToPage(page)
  await nextTick()
  await wait(400)

  // Same 2 × 3 slot layout as drawAreaPage; places past the 6th aren't on the page
  const slot = areaPlaces(place.area).findIndex((p) => p.id === placeId)
  const at = slot >= 0 && slot < CHOP_TARGET && pagePoint(page, 136 + (slot % 2) * 240, 262 + Math.floor(slot / 2) * 140)
  const reveal = async () => {
    hiddenStamps.delete(placeId)
    navigator.vibrate?.(40)
    await repaintPage(page)
  }
  if (stampSlam && at) await stampSlam.slam({ x: at.x, y: at.y, size: 104 * at.scale, ink: AREAS[areaIndex].ink }, reveal)
  else await reveal()
  await wait(300)
}

async function runSlams() {
  busy.value = true
  for (const placeId of [...hiddenStamps]) await playNewStamp(placeId)
  // Stamps that load mid-slam get their turn too
  while (book.value && passport.pendingSlams.length) await playSlams()
  busy.value = false
}

async function loadMissions() {
  try {
    missions.value = await (await getDb()).listMissions()
  } catch (err) {
    console.warn('[passport] could not load missions for badges:', err.message)
  }
}

// Stamps, profile or badges can arrive after the pages were first drawn
watch(
  () => [passport.stamps.length, passport.seen.size, user.profile, catalog.value, badges.value],
  async () => {
    if (!pages.value.length || busy.value) return
    await repaintAll()
    if (passport.pendingSlams.length) runSlams()
  }
)

onMounted(async () => {
  await Promise.all([loadCatalog(), passport.whenLoaded()])
  for (const placeId of passport.takeFresh()) {
    if (passport.stampedIds.has(placeId)) hiddenStamps.add(placeId)
  }
  try {
    await Promise.all([
      document.fonts.load('700 20px Fredoka'),
      document.fonts.load('800 20px Poppins'),
      document.fonts.load('500 13px Poppins'),
      loadOtter(),
      loadMissions()
    ])
  } catch {}

  await repaintAll()
  await nextTick()
  try {
    stampSlam = new StampSlam(slamCanvas.value)
  } catch (err) {
    console.warn('[passport] WebGL unavailable, chops appear without the slam', err)
  }

  await wait(300)
  if (hiddenStamps.size || passport.pendingSlams.length) await runSlams()
  else goToPage(latestStampPage())
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stampSlam?.dispose()
  stampSlam = null
  pages.value.forEach((url) => URL.revokeObjectURL(url))
})

function onKey(e) {
  if (busy.value) return
  if (e.key === 'ArrowRight') book.value?.flipRight()
  if (e.key === 'ArrowLeft') book.value?.flipLeft()
}

// Opens on the page of your most recent stamp, or the identity page if there are none
function latestStampPage() {
  const latest = passport.stamps.reduce((a, b) => (String(b.stamped_at) > String(a?.stamped_at ?? '') ? b : a), null)
  const areaIndex = AREAS.findIndex((a) => a.id === latest?.area)
  return areaIndex < 0 ? 1 : FIRST_AREA_PAGE + areaIndex
}

function jumpToArea(areaId) {
  goToPage(FIRST_AREA_PAGE + AREAS.findIndex((a) => a.id === areaId))
}
</script>

<template>
  <main class="zt-page">
    <div class="mb-2">
      <h1 class="title mb-0">Passport</h1>
      <p class="text-muted small mb-0">{{ passport.stampedIds.size }} {{ passport.stampedIds.size === 1 ? 'place' : 'places' }} stamped · {{ passport.chopCount }} area {{ passport.chopCount === 1 ? 'chop' : 'chops' }}</p>
    </div>

    <div ref="stage" class="stage" :class="{ busy }">
      <Flipbook v-if="pages.length" ref="book" class="book" :pages="bookPages" :click-to-zoom="false" aria-label="Passport. Drag a page corner or tap a side to turn the page." />
      <canvas ref="slamCanvas" class="slam-canvas"></canvas>
    </div>

    <div class="d-flex justify-content-center align-items-center gap-3 mt-2">
      <button class="btn btn-soft" :disabled="busy || !book?.canFlipLeft" @click="book.flipLeft()" aria-label="Previous page"><i class="bi bi-chevron-left"></i></button>
      <span class="small fw-800 mono">{{ pageLabel }}</span>
      <button class="btn btn-soft" :disabled="busy || !book?.canFlipRight" @click="book.flipRight()" aria-label="Next page"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div v-if="openAreas.length" class="d-flex flex-wrap justify-content-center gap-2 mt-2">
      <RouterLink v-for="a in openAreas" :key="a.id" :to="{ path: '/codex', query: { area: a.id } }" class="btn btn-soft btn-sm">
        <span :style="{ color: a.ink }">{{ a.glyph }}</span> All {{ a.total }} {{ a.id }} places
      </RouterLink>
    </div>

    <div class="zt-section-title"><i class="bi bi-bookmark-star"></i> Jump to a page</div>
    <div class="d-flex flex-wrap gap-2">
      <button v-for="a in AREAS" :key="a.id" class="zt-chip" :disabled="busy" @click="jumpToArea(a.id)">
        <span :style="{ color: a.ink }">{{ a.glyph }}</span> {{ a.id }}
        <span v-if="passport.byArea[a.id]" class="badge rounded-pill text-bg-danger">{{ passport.byArea[a.id].length }}</span>
      </button>
    </div>
    <p v-if="!passport.stamps.length" class="small text-muted mt-3">
      No stamps yet. Walk into a stop’s ring on the <RouterLink to="/map">map</RouterLink> and tap Stamp. Stamp {{ CHOP_TARGET }} places in an area to earn its chop.
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
/* Portrait on phones, so flipbook-vue shows one large page instead of two small ones */
@media (max-width: 600px) { .stage { aspect-ratio: 3 / 4.1; max-height: 72vh; } }
.book { width: 100%; height: 100%; }
.stage.busy .book { pointer-events: none; }
.slam-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
