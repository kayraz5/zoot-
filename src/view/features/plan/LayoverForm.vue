// EDITOR: Kayra

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useTripStore, layoverError, isCleared, MAX_AHEAD_DAYS, MIN_LAYOVER_H, MAX_LAYOVER_H } from '../../../model/stores/trip.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { ORIGINS } from '../../../model/data/origins.js'
import { computeBudget } from '../../../model/services/planner.js'
import { distanceM } from '../../../model/services/travel.js'
import { formatDuration, formatTime, toSgLocalInput, fromSgLocalInput } from '../../../model/services/hours.js'
import { now, tick } from '../../../model/services/clock.js'

/**
 * FIRST QUESTION, inline at the top of the plan page: when and where you land, and when and
 * where your next flight leaves. Already at Changi? "Use my location" fills in the terminal
 * and the landing time, and "I'm landside already" skips the immigration buffer.
 */
const props = defineProps({
	/** False on the very first visit: there is nothing to cancel back to. */
	canCancel: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const trip = useTripStore()
const ui = useUiStore()
const d = trip.draft

/** Passengers land and fly out of T1–T4 (Jewel is the landside mall next to T1). */
const TERMINALS = ['changi-t1', 'changi-t2', 'changi-t3', 'changi-t4']
	.map((id) => ORIGINS.find((o) => o.id === id))
	.map((o) => ({ ...o, tile: o.short.replace('Changi ', '') }))
const JEWEL = ORIGINS.find((o) => o.id === 'jewel')
const terminalName = (id) => TERMINALS.find((t) => t.id === id)?.tile

const arrival = ref(d.layoverSet ? d.arrivalLocal : '')
const departure = ref(d.layoverSet ? d.mustReturnLocal : '')
const arrivalTerminal = ref(d.arrivalTerminal)
const departureTerminal = ref(d.departureTerminal)
const landside = ref(d.landside)
const atJewel = ref(d.originId === 'jewel') // set by "Use my location" when Jewel is closest
// Most connections leave from the terminal they land at: follow it until they pick another.
const departureTouched = ref(d.layoverSet && d.departureTerminal !== d.arrivalTerminal)
watch(arrivalTerminal, (id) => { if (!departureTouched.value) departureTerminal.value = id })
function pickArrival(id) {
	arrivalTerminal.value = id
	atJewel.value = false
}
function pickDeparture(id) {
	departureTerminal.value = id
	departureTouched.value = true
}

// ── "Use my location": snap to the nearest terminal (or Jewel) and treat them as landed ──
const locating = ref(false)
const located = ref('') // "Near T3" once found
function useLocation() {
	if (!navigator.geolocation) return ui.toast('Location is not available on this device. Pick your terminal instead.', 'warning')
	locating.value = true
	navigator.geolocation.getCurrentPosition(
		(pos) => {
			locating.value = false
			const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
			const nearest = [...TERMINALS, JEWEL].map((o) => ({ o, dist: distanceM(here, o) })).sort((a, b) => a.dist - b.dist)[0]
			if (nearest.dist > 3000) {
				ui.toast(`You're about ${Math.round(nearest.dist / 1000)} km from Changi. Enter your times and terminals instead.`, 'warning', 5000)
				return
			}
			const jewel = nearest.o.id === 'jewel'
			// Jewel is landside and joined to T1, so that's the terminal they came through.
			pickArrival(jewel ? 'changi-t1' : nearest.o.id)
			atJewel.value = jewel
			if (jewel) landside.value = true
			// They're here, so they've landed: default the landing time to now.
			if (!arrival.value || fromSgLocalInput(arrival.value) > now()) arrival.value = toSgLocalInput(Math.floor(now() / 300000) * 300000)
			located.value = jewel ? 'At Jewel' : `Near ${nearest.o.tile}`
		},
		() => {
			locating.value = false
			ui.toast('Could not get your location. Pick your terminal instead.', 'warning')
		},
		{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
	)
}

const first = ref(null)
onMounted(() => { if (!props.canCancel) first.value?.focus() })

const arrivalMs = computed(() => (arrival.value ? fromSgLocalInput(arrival.value) : NaN))
const departureMs = computed(() => (departure.value ? fromSgLocalInput(departure.value) : NaN))
const bothSet = computed(() => Boolean(arrival.value && departure.value))
const error = computed(() => (bothSet.value ? (tick.value, layoverError(arrivalMs.value, departureMs.value)) : ''))
const canContinue = computed(() => bothSet.value && !error.value)
const originId = computed(() => (atJewel.value ? 'jewel' : arrivalTerminal.value))

const maxLocal = computed(() => toSgLocalInput(now() + MAX_AHEAD_DAYS * 86400e3))
const departureMin = computed(() => (tick.value, toSgLocalInput(Math.max(now(), Number.isFinite(arrivalMs.value) ? arrivalMs.value + MIN_LAYOVER_H * 3600e3 : now()))))

const preview = computed(() => {
	if (!bothSet.value || error.value) return null
	const startMs = Math.max(arrivalMs.value, now())
	const origin = ORIGINS.find((o) => o.id === originId.value)
	const cleared = isCleared(originId.value, arrivalMs.value, startMs, landside.value)
	const budget = computeBudget({ origin, startMs, mustReturnMs: departureMs.value, cleared })
	return {
		layover: formatDuration(Math.round((departureMs.value - arrivalMs.value) / 60000)),
		explore: formatDuration(Math.max(0, budget.usable_min)),
		backBy: formatTime(budget.arriveByMs),
		tight: budget.usable_min < 60
	}
})
function submit() {
	if (!canContinue.value) return
	const refused = trip.setLayover(arrival.value, departure.value, {
		arrivalTerminal: arrivalTerminal.value,
		departureTerminal: departureTerminal.value,
		originId: originId.value,
		landside: landside.value
	})
	if (!refused) emit('close')
}
</script>

<template>
	<form class="zt-card p-3 layover-form" aria-labelledby="layover-q" @submit.prevent="submit" @keydown.esc="canCancel && emit('close')">
		<div class="d-flex justify-content-between align-items-center gap-2">
			<h2 id="layover-q" class="plan-label mb-0"><i class="bi bi-airplane-fill"></i> Your layover</h2>
			<button v-if="canCancel" type="button" class="btn-close btn-sm" aria-label="Cancel" @click="emit('close')"></button>
		</div>

		<!-- Already at Changi: shortcuts -->
		<div class="quick mt-2">
			<button type="button" class="quick-chip" :class="{ on: located }" :disabled="locating" @click="useLocation">
				<i class="bi" :class="locating ? 'bi-hourglass-split' : located ? 'bi-geo-alt-fill' : 'bi-crosshair'"></i>
				{{ locating ? 'Locating…' : located || 'Use my location' }}
			</button>
			<button type="button" class="quick-chip" :class="{ on: landside }" :aria-pressed="landside" @click="landside = !landside">
				<i class="bi" :class="landside ? 'bi-check-circle-fill' : 'bi-door-open'"></i> I'm landside already
			</button>
		</div>

		<div class="leg mt-3">
			<div class="leg-head">
				<label class="plan-label mb-0" for="lay-arrival"><i class="bi bi-airplane-engines"></i> Land</label>
				<div class="seg" role="radiogroup" aria-label="Arrival terminal">
					<button v-for="t in TERMINALS" :key="t.id" type="button" role="radio" :class="{ active: arrivalTerminal === t.id }"
						:aria-checked="arrivalTerminal === t.id" :aria-label="`Arrive at ${t.label}`" @click="pickArrival(t.id)">{{ t.tile }}</button>
				</div>
			</div>
			<input id="lay-arrival" ref="first" v-model="arrival" type="datetime-local" class="form-control" :max="maxLocal" required />
		</div>

		<div class="leg mt-2">
			<div class="leg-head">
				<label class="plan-label mb-0" for="lay-departure"><i class="bi bi-airplane"></i> Next flight</label>
				<div class="seg" role="radiogroup" aria-label="Departure terminal">
					<button v-for="t in TERMINALS" :key="t.id" type="button" role="radio" :class="{ active: departureTerminal === t.id }"
						:aria-checked="departureTerminal === t.id" :aria-label="`Depart from ${t.label}`" @click="pickDeparture(t.id)">{{ t.tile }}</button>
				</div>
			</div>
			<input id="lay-departure" v-model="departure" type="datetime-local" class="form-control" :min="departureMin" :max="maxLocal" required />
		</div>

		<p class="tiny mt-2 mb-0 help" :class="error ? 'text-danger fw-800' : 'text-muted'" aria-live="polite">
			<template v-if="error">{{ error }}</template>
			<template v-else-if="preview">
				<b>{{ preview.layover }}</b> layover: about <b>{{ preview.explore }}</b> to explore, back at
				{{ terminalName(departureTerminal) }} by <b>{{ preview.backBy }}</b>
				<span v-if="preview.tight" class="d-block text-danger fw-800">Too tight to leave the airport safely.</span>
			</template>
			<template v-else>Singapore time · layovers of {{ MIN_LAYOVER_H }}–{{ MAX_LAYOVER_H }} h, now or up to a year ahead.</template>
		</p>

		<button type="submit" class="btn btn-primary w-100 mt-2" :disabled="!canContinue">
			{{ canCancel ? 'Save layover' : 'Continue' }} <i class="bi bi-chevron-right"></i>
		</button>
	</form>
</template>

<style scoped>
.quick { display: flex; gap: 8px; flex-wrap: wrap; }
.quick-chip {
	display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px;
	border: 2px dashed var(--zt-line); background: var(--zt-card); color: var(--zt-ink); font-weight: 800; font-size: 0.78rem;
}
.quick-chip.on { border-style: solid; background: var(--zt-yellow); color: #111; }
.quick-chip:disabled { opacity: 0.7; }

/* Label + terminal picker share a line; the time input sits under them. */
.leg-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.leg .form-control { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; }
.seg { display: inline-flex; border: 2px solid var(--zt-line); border-radius: 10px; overflow: hidden; flex: none; }
.seg button {
	border: 0; border-left: 2px solid var(--zt-line); background: var(--zt-card); color: var(--zt-ink);
	font-weight: 900; font-size: 0.78rem; padding: 4px 10px;
}
.seg button:first-child { border-left: 0; }
.seg button.active { background: var(--zt-yellow); color: #111; }
.help { min-height: 2.4em; }
</style>
