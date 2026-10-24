<!-- EDITOR: KAYRA -->

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../../model/stores/trip.js'
import { useMissionStore } from '../../model/stores/mission.js'
import { useUserStore } from '../../model/stores/user.js'
import { useUiStore } from '../../model/stores/ui.js'
import { ORIGINS, STYLES } from '../../model/data/origins.js'
import { computeBudget } from '../../model/services/planner.js'
import { formatDuration, formatTime, toSgLocalInput } from '../../model/services/hours.js'
import { distanceM } from '../../model/services/travel.js'
import { now, tick } from '../../model/services/clock.js'
import BufferBar from '../components/BufferBar.vue'
import LayoverDialog from '../components/plan/LayoverDialog.vue'

/**
 * Plan a layover, flight time first (Kayra: itinerary engine, planner.js).
 * Phones get three short steps; from 992px wide the same sections sit on one page
 * with a sticky summary card.
 */
const trip = useTripStore()
const mission = useMissionStore()
const user = useUserStore()
const ui = useUiStore()
const router = useRouter()
const d = trip.draft
const planning = ref(false)

// ── Layout: wizard on phones, one page on wide screens ─────────────────
const wideQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 992px)') : null
const wide = ref(wideQuery?.matches ?? false)
const onWide = (e) => (wide.value = e.matches)
const step = ref(1)
const STEPS = ['Where & when', 'What you like', 'Your style']
const showStep = (n) => wide.value || step.value === n

// Planning is a focused flow: no bottom nav, a back arrow to Home instead. Set during setup
// (not after an async check) so the nav never flashes in and out when the page opens.
ui.navHidden = true

onMounted(() => {
	wideQuery?.addEventListener('change', onWide)
	if (!ui.weather) ui.loadWeather()
	ui.loadAdvisories?.()
	prePickInterests()
})
onBeforeUnmount(() => {
	wideQuery?.removeEventListener('change', onWide)
	ui.navHidden = false
})

// ── Time budget ────────────────────────────────────────────────────────
const budget = computed(() => {
	tick.value // re-evaluate as the clock moves
	return computeBudget({ origin: trip.origin, startMs: trip.startMs, mustReturnMs: trip.mustReturnMs, cleared: trip.cleared })
})
const tooShort = computed(() => budget.value.usable_min < 60)
const bufferMin = computed(() => budget.value.reentry_min + budget.value.safety_min + budget.value.exit_min)
const showBuffers = ref(false)

/** 362 → "6H 02M" for the big number, "6h 02m" for the pill. */
function hm(min, upper = true) {
	const m = Math.max(0, Math.round(min))
	const s = `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
	return upper ? s.toUpperCase() : s
}

const sgDate = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' })
const dayOf = (ms) => sgDate.format(ms).replace(',', '')
const arrivalDay = computed(() => dayOf(trip.arrivalMs))
const departureDay = computed(() => dayOf(trip.mustReturnMs))
const sameDay = computed(() => arrivalDay.value === departureDay.value)

// ── Layover (step 0, also reopened from the layover card) ──────────────
const editingLayover = ref(false)
const showLayoverDialog = computed(() => !d.layoverSet || editingLayover.value)

// ── Start time (More options): at landing, or a later time inside the layover ──
const startMinLocal = computed(() => (tick.value, toSgLocalInput(Math.max(trip.arrivalMs, now()))))
const startMaxLocal = computed(() => toSgLocalInput(trip.mustReturnMs - 60 * 60000))
const startInPast = computed(() => (tick.value, !d.startAtLanding && trip.startMs < now() - 60000))
/** Forecasts only reach a week ahead; rain checks kick in closer to the day. */
const beyondForecast = computed(() => (tick.value, trip.startMs - now() > 7 * 86400e3))

// ── Starting from ──────────────────────────────────────────────────────
const TERMINAL_ORDER = ['changi-t1', 'changi-t2', 'changi-t3', 'changi-t4', 'jewel']
const terminals = computed(() =>
	TERMINAL_ORDER.map((id) => ORIGINS.find((o) => o.id === id)).filter(Boolean)
		.map((o) => ({ ...o, tile: o.id === 'jewel' ? 'Jewel' : o.short.replace('Changi ', '') }))
)
/** Set when the origin came from "My location"; that tile is then the selected one. */
const viaLocation = ref(false)
function pickOrigin(id) {
	d.originId = id
	viaLocation.value = false
}
const nearTile = computed(() => terminals.value.find((o) => o.id === d.originId)?.tile)

const locating = ref(false)
function useMyLocation() {
	if (!navigator.geolocation) return ui.toast('Location is not available on this device. Pick your terminal instead.', 'warning')
	locating.value = true
	viaLocation.value = false
	navigator.geolocation.getCurrentPosition(
		(pos) => {
			locating.value = false
			const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
			const nearest = terminals.value.map((o) => ({ o, dist: distanceM(here, o) })).sort((a, b) => a.dist - b.dist)[0]
			if (!nearest || nearest.dist > 3000) {
				ui.toast(`You're about ${Math.round((nearest?.dist ?? 0) / 1000)} km from Changi. Pick the terminal your flight leaves from.`, 'warning', 5000)
				return
			}
			pickOrigin(nearest.o.id)
			viaLocation.value = true
		},
		() => {
			locating.value = false
			ui.toast('Could not get your location. Pick your terminal instead.', 'warning')
		},
		{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
	)
}

// ── Interests ──────────────────────────────────────────────────────────
/** Six tiles, each covering one or more catalog tags the planner scores on. */
const TILES = [
	{ id: 'food', label: 'Food & hawker', icon: 'bi-egg-fried', tags: ['hawker', 'food'] },
	{ id: 'nature', label: 'Nature & gardens', icon: 'bi-flower1', tags: ['gardens', 'nature', 'beach'] },
	{ id: 'culture', label: 'Culture & heritage', icon: 'bi-bank', tags: ['culture', 'heritage', 'museum'] },
	{ id: 'views', label: 'Views & photos', icon: 'bi-camera', tags: ['views', 'photo'] },
	{ id: 'shopping', label: 'Shopping', icon: 'bi-bag', tags: ['shopping'] },
	{ id: 'nightlife', label: 'Nightlife', icon: 'bi-moon-stars', tags: ['nightlife'] }
]
/** What each travel style pre-picks until the traveller taps a tile. */
const STYLE_TILES = {
	budget: ['food', 'nature', 'views'],
	adventurous: ['nature', 'views', 'food'],
	party: ['nightlife', 'food', 'views'],
	conservative: ['culture', 'shopping', 'food']
}
const tileOn = (t) => t.tags.some((tag) => d.interests.includes(tag))
function toggleTile(t) {
	const next = tileOn(t) ? d.interests.filter((i) => !t.tags.includes(i)) : [...d.interests, ...t.tags]
	trip.setInterests(next)
}
function prePickInterests() {
	if (d.interestsTouched) return
	const tiles = STYLE_TILES[styleId.value] || STYLE_TILES.budget
	trip.setInterests(TILES.filter((t) => tiles.includes(t.id)).flatMap((t) => t.tags), { touched: false })
}

// ── Travel style ───────────────────────────────────────────────────────
const STYLE_SUB = { budget: 'Free & cheap', adventurous: 'More stops', party: 'Late & lively', conservative: 'Few stops, indoors' }
const styleId = computed(() => (STYLES[user.profile?.style] ? user.profile.style : 'budget'))
watch(styleId, prePickInterests)

async function setStyle(id) {
	try {
		await user.updateProfile({ style: id })
	} catch (err) {
		ui.toast(err.message, 'danger')
	}
}

// ── More options ───────────────────────────────────────────────────────
const optionsOpen = ref(false)
const WALKS = [10, 15, 20, 30]
const FOOD = [
	{ id: 'none', label: 'None' },
	{ id: 'halal', label: 'Halal' },
	{ id: 'vegetarian', label: 'Vegetarian' },
	{ id: 'vegan', label: 'Vegan' }
]
const optionsSummary = computed(() => {
	const parts = [`Walk ≤ ${d.maxWalk} min`, `${d.partySize} ${d.partySize === 1 ? 'person' : 'people'}`]
	if (d.foodNeeds !== 'none') parts.push(FOOD.find((f) => f.id === d.foodNeeds)?.label)
	if (!d.startAtLanding) parts.push(`out at ${formatTime(trip.startMs)}`)
	return parts.join(' · ')
})
const setParty = (n) => (d.partySize = Math.min(8, Math.max(1, n)))

// ── Steps and submit ───────────────────────────────────────────────────
const canLeaveStep1 = computed(() => d.layoverSet && !tooShort.value && !startInPast.value)
const canBuild = computed(() => canLeaveStep1.value && d.interests.length > 0 && !planning.value)

function next() {
	if (step.value === 1 && !canLeaveStep1.value) return
	if (step.value === 2 && !d.interests.length) return ui.toast('Pick at least one thing you are into.', 'warning')
	step.value = Math.min(3, step.value + 1)
	window.scrollTo?.({ top: 0 })
}
/** Header back arrow: previous step on phones, otherwise out to Home. */
function back() {
	if (!wide.value && step.value > 1) step.value -= 1
	else router.push('/')
}
const backLabel = computed(() => (!wide.value && step.value > 1 ? 'Previous step' : 'Back to home'))

async function submit() {
	if (!canBuild.value) return
	planning.value = true
	try {
		const saved = await trip.saveTrip()
		const m = await mission.planFromTrip(saved)
		if (m) router.push(`/mission/${m.id}`)
	} catch (err) {
		ui.toast(err.message, 'danger')
	} finally {
		planning.value = false
	}
}
</script>

<template>
	<main class="zt-page plan" :class="{ 'zt-page-wide': wide, 'is-wide': wide }">
		<!-- Header: title, step progress on phones -->
		<header class="mb-3">
			<div class="d-flex align-items-center gap-2">
				<button type="button" class="icon-btn" :aria-label="backLabel" :title="backLabel" @click="back"><i class="bi bi-chevron-left"></i></button>
				<h1 class="zt-display mb-0 flex-grow-1 plan-title">Plan a layover</h1>
				<span v-if="!wide && step > 1 && d.layoverSet" class="zt-pill left-pill"><i class="bi bi-clock"></i> {{ hm(budget.usable_min, false) }} left</span>
			</div>
			<template v-if="!wide">
				<div class="steps mt-2" role="progressbar" :aria-valuenow="step" aria-valuemin="1" aria-valuemax="3">
					<span v-for="n in 3" :key="n" :class="{ on: n <= step }"></span>
				</div>
				<div class="tiny text-muted text-end fw-800 mt-1">{{ step }} / 3 · {{ STEPS[step - 1] }}</div>
			</template>
		</header>

		<div class="plan-grid">
			<div class="plan-main d-grid gap-3">
				<!-- Step 1: layover, entry check, time budget, starting point -->
				<template v-if="showStep(1)">
					<section class="zt-card p-3">
						<div class="label">Your layover</div>
						<button type="button" class="field-btn layover-btn" aria-label="Change your layover times" @click="editingLayover = true">
							<span class="leg">
								<span class="leg-k"><i class="bi bi-airplane-engines"></i> Lands</span>
								<b class="mono">{{ d.layoverSet ? `${arrivalDay} · ${formatTime(trip.arrivalMs)}` : 'Add times' }}</b>
							</span>
							<i class="bi bi-arrow-right leg-arrow" aria-hidden="true"></i>
							<span class="leg">
								<span class="leg-k"><i class="bi bi-airplane"></i> Departs</span>
								<b class="mono">{{ d.layoverSet ? `${sameDay ? '' : departureDay + ' · '}${formatTime(trip.mustReturnMs)}` : '—' }}</b>
							</span>
							<i class="bi bi-chevron-right ms-auto" aria-hidden="true"></i>
						</button>
						<div v-if="d.layoverSet" class="layover-meta tiny mt-2">
							<span><i class="bi bi-hourglass-split"></i> Layover {{ formatDuration(trip.layoverMin) }}</span>
						</div>
					</section>

					<section v-if="!wide" class="have-card" :class="{ tight: d.layoverSet && tooShort }">
						<template v-if="d.layoverSet">
							<div class="label">You have</div>
							<div class="d-flex align-items-baseline gap-2 flex-wrap">
								<span class="big">{{ hm(budget.usable_min) }}</span><b class="small">to explore</b>
							</div>
							<p class="small fw-800 mb-1">Be back at {{ trip.origin.short }} by {{ formatTime(budget.arriveByMs) }}</p>
							<button type="button" class="link-btn" @click="showBuffers = !showBuffers">
								<i class="bi bi-info-circle"></i> Includes {{ bufferMin }} min airport buffer
							</button>
							<BufferBar v-if="showBuffers" class="mt-2" :start-ms="trip.startMs" :window-min="budget.window_min" :exit-min="budget.exit_min"
								:out-min="Math.max(0, budget.usable_min)" :reentry-min="budget.reentry_min" :safety-min="budget.safety_min" />
							<p v-if="tooShort" class="small fw-800 mb-0 mt-2">Too tight to leave the airport safely. Stay airside and explore the terminal.</p>
							<p v-else-if="beyondForecast" class="tiny mb-0 mt-2"><i class="bi bi-cloud-sun"></i> Rain checks start a week before your trip. Replan closer to the day.</p>
						</template>
						<p v-else class="small fw-800 mb-0">Add your landing and departure times to see how long you have.</p>
					</section>

					<section class="zt-card p-3">
						<div class="label">Starting from</div>
						<div class="terminal-grid">
							<!-- "My location" is a tile like the terminals; it snaps to the nearest one. -->
							<button type="button" class="terminal locate" :class="{ active: viaLocation }" :disabled="locating"
								:aria-pressed="viaLocation" @click="useMyLocation">
								<i class="bi" :class="locating ? 'bi-hourglass-split' : 'bi-crosshair'"></i>
								<span>{{ locating ? 'Locating' : 'My location' }}</span>
								<small v-if="viaLocation && nearTile">Near {{ nearTile }}</small>
							</button>
							<button v-for="o in terminals" :key="o.id" type="button" class="terminal" :class="{ active: !viaLocation && d.originId === o.id }"
								:aria-pressed="!viaLocation && d.originId === o.id" @click="pickOrigin(o.id)">
								<i class="bi" :class="o.id === 'jewel' ? 'bi-gem' : 'bi-airplane-engines'"></i>
								<span>{{ o.tile }}</span>
							</button>
						</div>
					</section>
				</template>

				<!-- Step 2: interests -->
				<section v-if="showStep(2)" :class="{ 'zt-card p-3': wide }">
					<div class="d-flex justify-content-between align-items-baseline flex-wrap gap-1">
						<component :is="wide ? 'div' : 'h2'" :class="wide ? 'label' : 'zt-display step-h'">What are you into?</component>
						<span class="tiny text-muted">{{ d.interestsTouched ? 'Tap to change.' : 'Pre-picked from your style quiz. Tap to change.' }}</span>
					</div>
					<div class="tile-grid mt-2">
						<button v-for="t in TILES" :key="t.id" type="button" class="tile" :class="{ active: tileOn(t) }" :aria-pressed="tileOn(t)" @click="toggleTile(t)">
							<i class="bi" :class="t.icon"></i>
							<span>{{ t.label }}</span>
							<i v-if="tileOn(t)" class="bi bi-check-circle-fill check"></i>
						</button>
					</div>
				</section>

				<!-- Step 3: travel style + more options -->
				<template v-if="showStep(3)">
					<section :class="{ 'zt-card p-3': wide }">
						<div class="d-flex justify-content-between align-items-baseline">
							<component :is="wide ? 'div' : 'h2'" :class="wide ? 'label' : 'zt-display step-h'">How do you travel?</component>
							<RouterLink v-if="wide" class="tiny fw-800" :to="{ path: '/onboard', query: { next: '/plan' } }">Retake the quiz</RouterLink>
						</div>
						<div class="style-grid mt-2">
							<button v-for="(s, id) in STYLES" :key="id" type="button" class="style-card" :class="{ active: styleId === id }"
								:aria-pressed="styleId === id" @click="setStyle(id)">
								<i class="bi" :class="s.icon"></i>
								<b>{{ s.label }}</b>
								<span class="tiny">{{ STYLE_SUB[id] }}</span>
								<i v-if="styleId === id" class="bi bi-check-circle-fill check"></i>
							</button>
						</div>
						<RouterLink v-if="!wide" class="tiny fw-800 d-inline-block mt-2" :to="{ path: '/onboard', query: { next: '/plan' } }">Not you? Retake the quiz</RouterLink>
					</section>

					<section class="zt-card options">
						<button type="button" class="options-row" :aria-expanded="optionsOpen" @click="optionsOpen = !optionsOpen">
							<span class="label mb-0">More options</span>
							<span class="tiny flex-grow-1 text-start ms-2">{{ optionsSummary }}</span>
							<i class="bi" :class="wide ? (optionsOpen ? 'bi-chevron-up' : 'bi-chevron-down') : 'bi-chevron-right'"></i>
						</button>
						<!-- Wide: inline panel. Phones: bottom sheet (below). -->
						<div v-if="wide && optionsOpen" class="px-3 pb-3">
							<div id="plan-options-inline"></div>
						</div>
					</section>
				</template>

				<!-- Phones: one primary action per step, above the bottom nav -->
				<div v-if="!wide" class="step-action" :class="{ 'no-nav': ui.navHidden }">
					<button v-if="step < 3" type="button" class="btn btn-primary btn-lg w-100" :disabled="step === 1 && !canLeaveStep1" @click="next">
						Next <i class="bi bi-chevron-right"></i>
					</button>
					<button v-else type="button" class="btn btn-primary btn-lg w-100" :disabled="!canBuild" @click="submit">
						<i class="bi bi-magic"></i> Build my quest
					</button>
				</div>

				<div v-if="startInPast" class="alert alert-warning mb-0">That start time has already passed. Pick a later one in More options, or go back to {{ trip.landed ? 'Now' : 'At landing' }}.</div>
				<div v-if="mission.refusal && !planning" class="alert alert-danger mb-0"><b>Planner refused:</b> {{ mission.refusal }}</div>
			</div>

			<!-- Wide: sticky summary -->
			<aside v-if="wide" class="plan-side">
				<div class="have-card" :class="{ tight: d.layoverSet && tooShort }">
					<template v-if="d.layoverSet">
						<div class="label">You have</div>
						<div class="big">{{ hm(budget.usable_min) }}</div>
						<b class="small d-block">to explore</b>
						<p class="small fw-800 mb-2 mt-2">Be back at {{ trip.origin.short }} by {{ formatTime(budget.arriveByMs) }}</p>
						<div class="share" :title="`${budget.usable_min} of ${budget.window_min} min outside`">
							<span :style="{ width: Math.max(0, Math.min(100, (100 * budget.usable_min) / Math.max(1, budget.window_min))) + '%' }"></span>
						</div>
						<button type="button" class="link-btn mt-2" @click="showBuffers = !showBuffers">
							<i class="bi bi-info-circle"></i> Includes {{ bufferMin }} min airport buffer
						</button>
						<BufferBar v-if="showBuffers" class="mt-2" :start-ms="trip.startMs" :window-min="budget.window_min" :exit-min="budget.exit_min"
							:out-min="Math.max(0, budget.usable_min)" :reentry-min="budget.reentry_min" :safety-min="budget.safety_min" />
						<p v-if="tooShort" class="small fw-800 mb-0 mt-2">Too tight to leave the airport safely.</p>
						<p v-else-if="beyondForecast" class="tiny mb-0 mt-2"><i class="bi bi-cloud-sun"></i> Rain checks start a week before your trip.</p>
					</template>
					<p v-else class="small fw-800 mb-0">Add your landing and departure times to see how long you have.</p>
				</div>
				<button type="button" class="btn btn-dark-pop btn-lg w-100 mt-3" :disabled="!canBuild" @click="submit">
					<i class="bi bi-magic"></i> Build my quest
				</button>
			</aside>
		</div>

		<!-- Step 0: landing + departure (and editing them later from the layover card) -->
		<LayoverDialog v-if="showLayoverDialog" :can-cancel="d.layoverSet" @close="editingLayover = false" />

		<!-- Phones: More options bottom sheet -->
		<div v-if="!wide && optionsOpen" class="scrim" @click.self="optionsOpen = false">
			<div class="sheet zt-card" role="dialog" aria-modal="true" aria-labelledby="opts-h">
				<div class="grabber"></div>
				<div class="d-flex justify-content-between align-items-center mb-2">
					<h2 id="opts-h" class="zt-display mb-0 sheet-h">More options</h2>
					<button type="button" class="btn-close" aria-label="Close" @click="optionsOpen = false"></button>
				</div>
				<div id="plan-options-sheet"></div>
				<button type="button" class="btn btn-primary btn-lg w-100 mt-3" @click="optionsOpen = false">Done</button>
			</div>
		</div>

		<!-- More options content, written once and teleported into the inline panel (wide) or the sheet (phones) -->
		<Teleport v-if="optionsOpen" defer :to="wide ? '#plan-options-inline' : '#plan-options-sheet'">
			<div class="label">Longest walk between stops</div>
			<div class="d-flex flex-wrap gap-2 mb-3">
				<button v-for="w in WALKS" :key="w" type="button" class="zt-chip" :class="{ active: d.maxWalk === w }" :aria-pressed="d.maxWalk === w" @click="d.maxWalk = w">{{ w }} min</button>
			</div>

			<div class="label">Travellers</div>
			<div class="stepper mb-3">
				<span class="fw-800 flex-grow-1">{{ d.partySize }} {{ d.partySize === 1 ? 'person' : 'people' }}</span>
				<button type="button" class="round" :disabled="d.partySize <= 1" aria-label="One fewer" @click="setParty(d.partySize - 1)"><i class="bi bi-dash"></i></button>
				<button type="button" class="round on" :disabled="d.partySize >= 8" aria-label="One more" @click="setParty(d.partySize + 1)"><i class="bi bi-plus"></i></button>
			</div>

			<div class="label">Food needs</div>
			<div class="d-flex flex-wrap gap-2 mb-3">
				<button v-for="f in FOOD" :key="f.id" type="button" class="zt-chip" :class="{ active: d.foodNeeds === f.id }" :aria-pressed="d.foodNeeds === f.id" @click="d.foodNeeds = f.id">{{ f.label }}</button>
			</div>

			<div class="label">Heading out</div>
			<div class="d-flex flex-wrap gap-2 mb-2">
				<button type="button" class="zt-chip" :class="{ active: d.startAtLanding }" @click="trip.setStart(true)">{{ trip.landed ? 'Now' : 'At landing' }}</button>
				<button type="button" class="zt-chip" :class="{ active: !d.startAtLanding }" @click="trip.setStart(false)">Later</button>
			</div>
			<input v-if="!d.startAtLanding" type="datetime-local" class="form-control mb-1" aria-label="Start time (Singapore time)" :value="d.startLocal"
				:min="startMinLocal" :max="startMaxLocal" @change="trip.setStart(false, $event.target.value)" />
			<p class="tiny text-muted mb-3">{{ d.startAtLanding ? (trip.landed ? 'You have landed, so the plan starts from now.' : 'The plan starts when you land.') : 'For example after a nap or a shower at the airport.' }}</p>

			<div class="row g-3">
				<div class="col-6">
					<div class="label">Pace</div>
					<select v-model="d.energy" class="form-select form-select-sm" aria-label="Pace">
						<option value="low">Relaxed</option>
						<option value="med">Medium</option>
						<option value="high">Packed</option>
					</select>
				</div>
				<div class="col-6">
					<div class="label">Indoors</div>
					<select v-model="d.indoorPref" class="form-select form-select-sm" aria-label="Indoors">
						<option value="any">No preference</option>
						<option value="prefer">Prefer air-con</option>
						<option value="only">Indoor only</option>
					</select>
				</div>
			</div>
		</Teleport>

		<div v-if="planning" class="planning-overlay" role="alert" aria-live="assertive">
			<div class="zt-card p-4 text-center">
				<div class="spinner-border text-primary mb-3" role="status"></div>
				<div class="fw-800">{{ mission.statusText || 'Plotting your quest…' }}</div>
				<div class="tiny text-muted mt-1">Turf clusters · MRT matrix · Open-Meteo · Groq</div>
			</div>
		</div>
	</main>
</template>

<style scoped>
.plan-title { font-size: 2.2rem; }
.is-wide .plan-title { font-size: 2.8rem; }
.step-h { font-size: 2rem; margin: 0; }
.label {
	font-weight: 800;
	font-size: 0.68rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 8px;
}

/* Step progress */
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.steps span { height: 6px; border-radius: 999px; background: var(--zt-yellow-pale); border: 1.5px solid var(--zt-soft-line); }
.steps span.on { background: var(--zt-yellow); border-color: var(--zt-line); }
.left-pill { background: var(--zt-yellow); color: #111; white-space: nowrap; }
.icon-btn { border: 0; background: none; color: var(--zt-ink); font-size: 1.2rem; padding: 0 4px; }

/* Layout */
.plan-grid { display: grid; gap: 16px; }
.is-wide .plan-grid { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; gap: 24px; }
.plan-side { position: sticky; top: 16px; }

/* Field-style buttons (flight time, use my location) */
.field-btn {
	display: flex; align-items: center; gap: 10px; width: 100%;
	padding: 10px 14px; border: var(--zt-bw) solid var(--zt-line); border-radius: 14px;
	background: var(--zt-card); color: var(--zt-ink); font-size: 0.85rem;
}
.field-btn:hover:not(:disabled) { background: var(--zt-yellow-pale); }
.sgt { font-size: 0.62rem; font-weight: 800; color: var(--zt-muted); }
/* Layover summary: lands → departs */
.layover-btn { gap: 12px; }
.leg { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.leg-k { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--zt-muted); }
.leg b { white-space: nowrap; font-size: 0.88rem; }
.leg-arrow { color: var(--zt-muted); }
.layover-meta { display: flex; flex-wrap: wrap; column-gap: 14px; row-gap: 2px; color: var(--zt-muted); font-weight: 700; }
.layover-meta > span { white-space: nowrap; }
.layover-meta .bi { margin-right: 3px; }

/* "You have" card */
.have-card {
	background: var(--zt-yellow); color: #111; border: var(--zt-bw) solid var(--zt-line);
	border-radius: var(--zt-radius); padding: 16px; box-shadow: var(--zt-shadow);
}
.have-card .label { color: #111; }
.have-card.tight { background: #ffd9c9; }
.have-card .big { font-family: var(--zt-font-display); font-size: 3.2rem; line-height: 0.9; }
.is-wide .have-card .big { font-size: 4rem; }
.link-btn { border: 0; background: none; padding: 0; color: #111; font-size: 0.72rem; font-weight: 800; text-decoration: underline; }
.share { height: 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.12); overflow: hidden; }
.share span { display: block; height: 100%; background: #111; border-radius: 999px; }

/* Terminals */
/* My location + T1–T4 + Jewel: 3×2 on phones, one row of 6 on wide screens. */
.terminal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.is-wide .terminal-grid { grid-template-columns: repeat(6, 1fr); }
.terminal {
	display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 10px 4px; min-height: 64px;
	border: 2px solid var(--zt-line); border-radius: 14px; background: var(--zt-card); color: var(--zt-ink);
	font-weight: 800; font-size: 0.72rem; text-transform: uppercase;
}
.terminal i { font-size: 1.1rem; }
.terminal small { font-size: 0.62rem; font-weight: 700; text-transform: none; opacity: 0.8; }
.terminal.locate { border-style: dashed; }
.terminal.locate.active { border-style: solid; }
.terminal:disabled { opacity: 0.7; }
.terminal.active { background: var(--zt-yellow); color: #111; box-shadow: 0 3px 0 var(--zt-shadow-color); transform: translateY(-2px); }

/* Interest tiles and style cards */
.tile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.is-wide .tile-grid { grid-template-columns: repeat(3, 1fr); }
.tile, .style-card {
	position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left;
	padding: 12px; min-height: 88px; border: 2px solid var(--zt-line); border-radius: 16px;
	background: var(--zt-card); color: var(--zt-ink); font-weight: 800; font-size: 0.8rem;
}
.is-wide .tile { flex-direction: row; align-items: center; min-height: 0; padding: 10px 12px; }
.tile i:first-child, .style-card i:first-child { font-size: 1.2rem; }
.tile.active, .style-card.active { background: var(--zt-yellow-pale); box-shadow: 0 4px 0 var(--zt-shadow-color); }
.check { position: absolute; top: 8px; right: 8px; font-size: 1rem; color: #111; }
[data-bs-theme='dark'] .tile.active, [data-bs-theme='dark'] .style-card.active { color: #111; }
.style-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.is-wide .style-grid { grid-template-columns: repeat(4, 1fr); }
.style-card b { text-transform: uppercase; font-size: 0.78rem; }
.style-card .tiny { font-weight: 600; color: inherit; opacity: 0.8; }

/* More options */
.options { padding: 0; overflow: hidden; }
.options-row { display: flex; align-items: center; width: 100%; padding: 14px 16px; border: 0; background: none; color: var(--zt-ink); }
.stepper { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border: 2px solid var(--zt-line); border-radius: 14px; }
.round { width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--zt-line); background: var(--zt-card); color: var(--zt-ink); display: grid; place-items: center; }
.round.on { background: var(--zt-yellow); color: #111; }
.round:disabled { opacity: 0.4; }

/* Phone primary action, kept above the bottom nav */
.step-action { position: sticky; bottom: calc(var(--zt-nav-h) + 24px); z-index: 5; }
.step-action.no-nav { bottom: max(16px, env(safe-area-inset-bottom)); }

/* Overlays */
.scrim {
	position: fixed; inset: 0; z-index: 1400; display: grid; place-items: end center;
	background: rgba(17, 17, 17, 0.45); padding: 16px;
}
.sheet { width: min(560px, 100%); padding: 12px 16px 16px; border-radius: 24px 24px 18px 18px; max-height: 85vh; overflow-y: auto; }
.sheet-h { font-size: 1.6rem; }
.grabber { width: 44px; height: 5px; border-radius: 999px; background: var(--zt-soft-line); margin: 0 auto 10px; }

.btn-dark-pop { background: #111; color: var(--zt-yellow); border: var(--zt-bw) solid #111; box-shadow: 0 4px 0 var(--zt-yellow-soft); }
.btn-dark-pop:hover { background: #222; color: var(--zt-yellow); }
.btn-dark-pop:disabled { opacity: 0.45; }

.planning-overlay {
	position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center;
	background: rgba(17, 17, 17, 0.55); padding: 16px;
}
.planning-overlay .zt-card { box-shadow: 8px 8px 0 var(--zt-shadow-color); }
</style>
