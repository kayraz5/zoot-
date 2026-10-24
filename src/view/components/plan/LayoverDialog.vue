<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTripStore, layoverError, MAX_AHEAD_DAYS } from '../../../model/stores/trip.js'
import { computeBudget } from '../../../model/services/planner.js'
import { formatDuration, formatTime, toSgLocalInput, fromSgLocalInput } from '../../../model/services/hours.js'
import { now, tick } from '../../../model/services/clock.js'

/**
 * First question of the plan flow: when you land and when your next flight leaves.
 * Works for layovers planned weeks ahead as well as for travellers who have already landed.
 */
const props = defineProps({
	/** False on the very first visit: there is nothing to go back to. */
	canCancel: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const trip = useTripStore()
const d = trip.draft

const arrival = ref(d.layoverSet ? d.arrivalLocal : '')
const departure = ref(d.layoverSet ? d.mustReturnLocal : '')
const first = ref(null)
onMounted(() => first.value?.focus())

const arrivalMs = computed(() => (arrival.value ? fromSgLocalInput(arrival.value) : NaN))
const departureMs = computed(() => (departure.value ? fromSgLocalInput(departure.value) : NaN))
const bothSet = computed(() => Boolean(arrival.value && departure.value))
const error = computed(() => (bothSet.value ? (tick.value, layoverError(arrivalMs.value, departureMs.value)) : ''))
const canContinue = computed(() => bothSet.value && !error.value)

const maxLocal = computed(() => toSgLocalInput(now() + MAX_AHEAD_DAYS * 86400e3))
const departureMin = computed(() => (tick.value, toSgLocalInput(Math.max(now(), Number.isFinite(arrivalMs.value) ? arrivalMs.value + 3600e3 : now()))))

const preview = computed(() => {
	if (!bothSet.value || error.value) return null
	const startMs = Math.max(arrivalMs.value, now())
	const budget = computeBudget({ origin: trip.origin, startMs, mustReturnMs: departureMs.value, cleared: d.cleared })
	return {
		layover: formatDuration(Math.round((departureMs.value - arrivalMs.value) / 60000)),
		explore: formatDuration(Math.max(0, budget.usable_min)),
		backBy: formatTime(budget.arriveByMs),
		tight: budget.usable_min < 60,
		landed: arrivalMs.value <= now()
	}
})
function submit() {
	if (!canContinue.value) return
	const refused = trip.setLayover(arrival.value, departure.value)
	if (!refused) emit('close')
}
</script>

<template>
	<div class="layover-backdrop" role="dialog" aria-modal="true" aria-labelledby="layover-q" @keydown.esc="canCancel && emit('close')">
		<form class="zt-card p-3 layover-card" @submit.prevent="submit">
			<div class="d-flex justify-content-between align-items-start">
				<span class="badge-icon"><i class="bi bi-airplane-fill"></i></span>
				<button v-if="canCancel" type="button" class="btn-close" aria-label="Cancel" @click="emit('close')"></button>
			</div>
			<h2 id="layover-q" class="zt-display mt-2 mb-1">Your layover</h2>
			<p class="tiny text-muted mb-3">Plan now or weeks ahead. Times are Singapore time, as on your boarding pass.</p>

			<div class="times">
				<div>
					<label class="label" for="lay-arrival"><i class="bi bi-airplane-engines"></i> Lands at Changi</label>
					<input id="lay-arrival" ref="first" v-model="arrival" type="datetime-local" class="form-control" :max="maxLocal" required />
				</div>
				<div>
					<label class="label" for="lay-departure"><i class="bi bi-airplane"></i> Next flight leaves</label>
					<input id="lay-departure" v-model="departure" type="datetime-local" class="form-control" :min="departureMin" :max="maxLocal" required />
				</div>
			</div>

			<p class="tiny mt-2 mb-0 help" :class="error ? 'text-danger fw-800' : 'text-muted'" aria-live="polite">
				<template v-if="error">{{ error }}</template>
				<template v-else-if="preview">
					Layover <b>{{ preview.layover }}</b> · about <b>{{ preview.explore }}</b> to explore<template v-if="preview.landed">, starting now</template>.
					Back at {{ trip.origin.short }} by {{ preview.backBy }}.
					<span v-if="preview.tight" class="d-block text-danger fw-800 mt-1">Too tight to leave the airport safely.</span>
				</template>
				<template v-else>Already landed? Enter your landing time anyway. We'll start from now.</template>
			</p>

			<button type="submit" class="btn btn-primary btn-lg w-100 mt-3" :disabled="!canContinue">
				Continue <i class="bi bi-chevron-right"></i>
			</button>
		</form>
	</div>
</template>

<style scoped>
/* Own class name: the parent's scoped `.scrim` (bottom-sheet positioning) also reaches a child's root. */
.layover-backdrop {
	position: fixed; inset: 0; z-index: 1400;
	display: flex; align-items: center; justify-content: center; padding: 16px;
	background: rgba(255, 251, 234, 0.92); backdrop-filter: blur(8px);
}
[data-bs-theme='dark'] .layover-backdrop { background: rgba(17, 17, 17, 0.92); }
.layover-card { width: min(420px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; margin: auto; box-shadow: 8px 8px 0 var(--zt-shadow-color); }
.layover-card h2 { font-size: 2rem; }
.badge-icon { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--zt-yellow); color: #111; border: 2px solid var(--zt-line); }
.label { display: block; font-weight: 800; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.label .bi { margin-right: 3px; }
/* One full-width row per time: datetime fields have a large intrinsic width and overflow side by side. */
.times { display: grid; gap: 12px; }
.times .form-control { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; }
.help { min-height: 2.6em; }
</style>
