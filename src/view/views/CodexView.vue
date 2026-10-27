<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { catalog, loadCatalog } from '../../model/services/catalog.js'
import { usePassportStore } from '../../model/stores/passport.js'
import { AREAS } from '../../model/data/origins.js'
import { placeStampUrl } from '../../model/services/stampArt.js'

// City Codex: every place by area, shown as stamped, seen or undiscovered. ?area=X shows one area.
const passport = usePassportStore()
const route = useRoute()
const onlyArea = computed(() => AREAS.find((area) => area.id === route.query.area)?.id || null)
const filter = ref('all')
const FILTERS = ['all', 'stamped', 'seen', 'unknown']

onMounted(loadCatalog)

const isStamped = (place) => passport.stampedIds.has(place.id)
const isSeen = (place) => passport.seen.has(place.id)
/** The place's pre-generated stamp PNG, or null when it has none. */
const stampFor = (place) => placeStampUrl(place.name)

function placeState(place) {
  if (isStamped(place)) return 'stamped'
  if (isSeen(place)) return 'seen'
  return 'unknown'
}

const isVisible = (place) => filter.value === 'all' || placeState(place) === filter.value

const areaGroups = computed(() =>
  AREAS
    .filter((area) => !onlyArea.value || area.id === onlyArea.value)
    .map((area) => {
      const places = catalog.value.filter((place) => place.area === area.id)
      return { ...area, places, stampedCount: places.filter(isStamped).length }
    })
    .filter((group) => group.places.length > 0)
)

const shownPlaces = computed(() => catalog.value.filter((place) => !onlyArea.value || place.area === onlyArea.value))
const total = computed(() => shownPlaces.value.length)
const stampedTotal = computed(() => shownPlaces.value.filter(isStamped).length)
const seenTotal = computed(() => shownPlaces.value.filter(isSeen).length)
</script>

<template>
  <main class="zt-page">
    <h1 class="title mb-1">City Codex</h1>
    <p class="text-muted small">{{ onlyArea || 'Singapore' }} · {{ stampedTotal }} stamped · {{ seenTotal }} seen · {{ total }} total</p>
    <div class="progress mb-3" style="height: 12px" role="progressbar" :aria-valuenow="stampedTotal" aria-valuemin="0" :aria-valuemax="total">
      <div class="progress-bar bar-stamped" :style="{ width: (stampedTotal / total) * 100 + '%' }"></div>
      <div class="progress-bar bar-seen" :style="{ width: ((seenTotal - stampedTotal) / total) * 100 + '%' }"></div>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <button v-for="f in FILTERS" :key="f" class="zt-chip text-capitalize" :class="{ active: filter === f }" @click="filter = f">{{ f === 'unknown' ? 'undiscovered' : f }}</button>
      <RouterLink v-if="onlyArea" to="/codex" class="zt-chip active ms-auto">{{ onlyArea }} <i class="bi bi-x-lg"></i></RouterLink>
    </div>

    <section v-for="group in areaGroups" :key="group.id" class="mb-3">
      <div class="zt-section-title">
        <span class="area-glyph" :style="{ color: group.ink }">{{ group.glyph }}</span> {{ group.id }}
        <span class="ms-auto tiny text-muted mono">{{ group.stampedCount }}/{{ group.places.length }}</span>
      </div>
      <div class="codex-grid">
        <RouterLink v-for="place in group.places.filter(isVisible)" :key="place.id" :to="`/place/${place.id}`" class="cell" :class="placeState(place)">
          <span class="icon">
            <img
              v-if="placeState(place) === 'stamped' && stampFor(place)"
              :src="stampFor(place)"
              alt=""
              class="stamp-thumb"
              loading="lazy"
            />
            <i v-else-if="placeState(place) === 'stamped'" class="bi bi-patch-check-fill"></i>
            <i v-else-if="placeState(place) === 'seen'" class="bi bi-eye"></i>
            <i v-else class="bi bi-geo-alt"></i>
          </span>
          <span class="name">{{ place.name }}</span>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.title { font-size: 2.4rem; }
.area-glyph { font-size: 1.3rem; }
.codex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border-radius: 16px; border: var(--zt-bw) solid var(--zt-line); background: var(--zt-card); text-decoration: none; color: var(--zt-ink); text-align: center; }
.cell .icon { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: var(--zt-card); border: 2px solid var(--zt-line); font-size: 1.1rem; color: var(--zt-ink); }
.cell .stamp-thumb { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; background: #fffbea; }
.cell.stamped { background: var(--zt-yellow); color: #111; box-shadow: var(--zt-shadow-sm); }
.cell.stamped .icon { background: #111; color: var(--zt-yellow); border-color: #111; }
.cell.seen .icon { background: var(--zt-yellow-pale); color: #111; }
.cell.unknown { border-style: dashed; }
.cell.unknown .name { color: var(--zt-muted); }
.cell.unknown .icon { border-style: dashed; color: var(--zt-muted); }
.name { font-size: 0.7rem; font-weight: 700; line-height: 1.15; }
.bar-stamped { background: #111; }
.bar-seen { background: var(--zt-yellow); }
[data-bs-theme='dark'] .bar-stamped { background: var(--zt-pink); }
</style>
