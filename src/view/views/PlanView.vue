<!-- EDITOR: KAYRA -->

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../../model/stores/trip.js'
import { useMissionStore } from '../../model/stores/mission.js'
import { useUiStore } from '../../model/stores/ui.js'
import { hm, usePlanTime, usePrePickedInterests } from '../components/plan/planUi.js'
import LayoverDialog from '../components/plan/LayoverDialog.vue'
import LayoverSummary from '../components/plan/LayoverSummary.vue'
import EntryBanner from '../components/plan/EntryBanner.vue'
import TimeBudgetCard from '../components/plan/TimeBudgetCard.vue'
import OriginPicker from '../components/plan/OriginPicker.vue'
import InterestTiles from '../components/plan/InterestTiles.vue'
import StylePicker from '../components/plan/StylePicker.vue'
import MoreOptions from '../components/plan/MoreOptions.vue'
import '../components/plan/plan.css'

/**
 * Plan a layover: Phones get three short steps;
 * from 992px wide the same sections sit on one page with a sticky summary card.
 * Each section is its own component in components/plan/.
 */
const trip = useTripStore()
const mission = useMissionStore()
const ui = useUiStore()
const router = useRouter()
const d = trip.draft
const planning = ref(false)
const { budget, tooShort, startInPast } = usePlanTime()
usePrePickedInterests()

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
})
onBeforeUnmount(() => {
	wideQuery?.removeEventListener('change', onWide)
	ui.navHidden = false
})

// Layover dialog: first thing on the page, reopened from the layover card.
const editingLayover = ref(false)
const showLayoverDialog = computed(() => !d.layoverSet || editingLayover.value)

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
				<template v-if="showStep(1)">
					<LayoverSummary @edit="editingLayover = true" />
					<EntryBanner />
					<TimeBudgetCard v-if="!wide" />
					<OriginPicker />
				</template>
				<InterestTiles v-if="showStep(2)" :wide="wide" />
				<template v-if="showStep(3)">
					<StylePicker :wide="wide" />
					<MoreOptions :wide="wide" />
				</template>

				<!-- Phones: one primary action per step, at the bottom of the screen -->
				<div v-if="!wide" class="step-action">
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

			<aside v-if="wide" class="plan-side">
				<TimeBudgetCard side />
				<button type="button" class="btn btn-dark-pop btn-lg w-100 mt-3" :disabled="!canBuild" @click="submit">
					<i class="bi bi-magic"></i> Build my quest
				</button>
			</aside>
		</div>

		<LayoverDialog v-if="showLayoverDialog" :can-cancel="d.layoverSet" @close="editingLayover = false" />

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

/* Phone primary action; the bottom nav is hidden on this page */
.step-action { position: sticky; bottom: max(16px, env(safe-area-inset-bottom)); z-index: 5; }

.btn-dark-pop { background: #111; color: var(--zt-yellow); border: var(--zt-bw) solid #111; box-shadow: 0 4px 0 var(--zt-yellow-soft); }
.btn-dark-pop:hover { background: #222; color: var(--zt-yellow); }
.btn-dark-pop:disabled { opacity: 0.45; }

.planning-overlay {
	position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center;
	background: rgba(17, 17, 17, 0.55); padding: 16px;
}
.planning-overlay .zt-card { box-shadow: 8px 8px 0 var(--zt-shadow-color); }
</style>
