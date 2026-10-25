<!-- EDITOR: KAYRA -->

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { catalog, loadCatalog } from '../../model/services/catalog.js'
import { isOpenDuringVisit } from '../../model/services/hours.js'
import { now } from '../../model/services/clock.js'
import { TILES } from '../components/plan/planUi.js'
import PlaceCard from '../components/explore/PlaceCard.vue'

/**
 * Explore: scroll through every place in the catalog. Search plus a few filters,
 * no accounts or progress needed (the passport's City Codex tracks what you've stamped).
 */
onMounted(loadCatalog)

const query = ref('')
const interests = ref([]) // TILES ids; a place matches if it fits any of them (like the plan page)
const area = ref('')
const openNow = ref(false)
const indoorOnly = ref(false)
const freeOnly = ref(false)

const areas = computed(() => [...new Set(catalog.value.map((p) => p.area))].sort())

const results = computed(() => {
	const q = query.value.trim().toLowerCase()
	const wanted = TILES.filter((tile) => interests.value.includes(tile.id)).flatMap((tile) => tile.tags)
	const t = now()
	return catalog.value
		.filter((p) => !q || [p.name, p.area, ...(p.tags || [])].some((s) => s?.toLowerCase().includes(q)))
		.filter((p) => !wanted.length || wanted.some((tag) => p.tags?.includes(tag)))
		.filter((p) => !area.value || p.area === area.value)
		.filter((p) => !openNow.value || isOpenDuringVisit(p, t, t + 60000))
		.filter((p) => !indoorOnly.value || p.indoor)
		.filter((p) => !freeOnly.value || !p.cost_band)
		.sort((a, b) => a.name.localeCompare(b.name))
})

// Render in pages of 24 (the catalog can hold hundreds of places); more load as you near the end.
const PAGE = 24
const limit = ref(PAGE)
const shown = computed(() => results.value.slice(0, limit.value))
const remaining = computed(() => results.value.length - shown.value.length)
const showMore = () => (limit.value += PAGE)
watch(results, () => (limit.value = PAGE)) // new filters start from the top

const sentinel = ref(null)
let observer = null
onMounted(() => {
	if (typeof IntersectionObserver === 'undefined') return
	observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && remaining.value > 0 && showMore(), { rootMargin: '600px' })
	watch(sentinel, (el, old) => {
		if (old) observer.unobserve(old)
		if (el) observer.observe(el)
	}, { immediate: true })
})
onBeforeUnmount(() => observer?.disconnect())

function toggleInterest(id) {
	interests.value = interests.value.includes(id) ? interests.value.filter((x) => x !== id) : [...interests.value, id]
}

const filtered = computed(() => Boolean(query.value || interests.value.length || area.value || openNow.value || indoorOnly.value || freeOnly.value))
function clearAll() {
	query.value = ''
	interests.value = []
	area.value = ''
	openNow.value = indoorOnly.value = freeOnly.value = false
}
</script>

<template>
	<main class="zt-page zt-page-wide explore">
		<header class="mb-3">
			<h1 class="zt-display mb-1 title">Explore Singapore</h1>
			<p class="text-muted small mb-0">{{ catalog.length }} places to discover on a layover. Tap one for details.</p>
		</header>

		<!-- Search + filters stay reachable while scrolling -->
		<div class="filters">
			<div class="search">
				<i class="bi bi-search" aria-hidden="true"></i>
				<input v-model="query" type="search" class="form-control" placeholder="Search places, areas or things to do" aria-label="Search places" />
			</div>
			<div class="chips" role="group" aria-label="Filters">
				<button v-for="t in TILES" :key="t.id" type="button" class="zt-chip" :class="{ active: interests.includes(t.id) }" :aria-pressed="interests.includes(t.id)"
					@click="toggleInterest(t.id)">
					<i class="bi" :class="interests.includes(t.id) ? 'bi-check-lg' : t.icon"></i> {{ t.label }}
				</button>
				<span class="sep" aria-hidden="true"></span>
				<button type="button" class="zt-chip" :class="{ active: openNow }" :aria-pressed="openNow" @click="openNow = !openNow"><i class="bi bi-clock"></i> Open now</button>
				<button type="button" class="zt-chip" :class="{ active: indoorOnly }" :aria-pressed="indoorOnly" @click="indoorOnly = !indoorOnly"><i class="bi bi-house"></i> Indoor</button>
				<button type="button" class="zt-chip" :class="{ active: freeOnly }" :aria-pressed="freeOnly" @click="freeOnly = !freeOnly"><i class="bi bi-tag"></i> Free</button>
			</div>
			<div class="d-flex align-items-center gap-2 mt-2">
				<select v-model="area" class="form-select form-select-sm area" aria-label="Area">
					<option value="">All areas</option>
					<option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
				</select>
				<span class="tiny text-muted fw-800 ms-auto" aria-live="polite">{{ results.length }} {{ results.length === 1 ? 'place' : 'places' }}</span>
				<button v-if="filtered" type="button" class="btn btn-link btn-sm p-0 fw-800" @click="clearAll">Clear</button>
			</div>
		</div>

		<template v-if="results.length">
			<div class="grid">
				<PlaceCard v-for="p in shown" :key="p.id" :place="p" />
			</div>
			<div v-if="remaining > 0" ref="sentinel" class="more">
				<button type="button" class="btn btn-soft" @click="showMore">Show more places <span class="text-muted">({{ remaining }} left)</span></button>
			</div>
		</template>
		<div v-else class="empty zt-card p-4 text-center">
			<i class="bi bi-binoculars fs-2"></i>
			<p class="fw-800 mb-1 mt-2">No places match</p>
			<p class="small text-muted mb-3">Try fewer filters or a different word.</p>
			<button type="button" class="btn btn-primary btn-sm" @click="clearAll">Clear filters</button>
		</div>
	</main>
</template>

<style scoped>
.title { font-size: clamp(2.2rem, 8vw, 3rem); }

.filters {
	position: sticky; top: 0; z-index: 10; margin: 0 -16px 16px; padding: 10px 16px 12px;
	background: var(--zt-bg); border-bottom: 1px solid var(--zt-soft-line);
}
.search { position: relative; }
.search .bi { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--zt-muted); pointer-events: none; }
.search .form-control { padding-left: 38px; }
/* One scrolling row of chips on phones, wrapping on wide screens */
.chips { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
.chips::-webkit-scrollbar { display: none; }
.chips .zt-chip { white-space: nowrap; flex: none; }
/* Touch screens keep :hover after a tap, which made a chip look selected after turning it off. */
@media (hover: none) {
	.chips .zt-chip:hover:not(.active) { background: var(--zt-card); color: var(--zt-ink); }
}
.sep { width: 1px; flex: none; background: var(--zt-soft-line); margin: 4px 2px; }
@media (min-width: 992px) { .chips { flex-wrap: wrap; overflow: visible; } }
.area { width: auto; max-width: 60%; }

.grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 576px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 992px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.more { display: flex; justify-content: center; margin: 20px 0 8px; }
.empty { max-width: 420px; margin: 24px auto; }
</style>
