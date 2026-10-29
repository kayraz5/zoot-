<script setup>
import { computed } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { toSgLocalInput } from '../../../model/services/hours.js'
import { now, tick } from '../../../model/services/clock.js'
import { FOOD, WALKS } from './planUi.js'

/** Walk limit, travellers, food needs, heading-out time, pace and indoors. */
const trip = useTripStore()
const d = trip.draft

// "Heading out" later must stay inside the layover.
const startMinLocal = computed(() => (tick.value, toSgLocalInput(Math.max(trip.arrivalMs, now()))))
const startMaxLocal = computed(() => toSgLocalInput(trip.mustReturnMs - 60 * 60000))
const setParty = (n) => (d.partySize = Math.min(8, Math.max(1, n)))
</script>

<template>
	<div>
		<div class="plan-label">Longest walk between stops</div>
		<div class="d-flex flex-wrap gap-2 mb-3">
			<button v-for="w in WALKS" :key="w" type="button" class="zt-chip" :class="{ active: d.maxWalk === w }" :aria-pressed="d.maxWalk === w" @click="d.maxWalk = w">{{ w }} min</button>
		</div>

		<div class="plan-label">Travellers</div>
		<div class="stepper mb-3">
			<span class="fw-800 flex-grow-1">{{ d.partySize }} {{ d.partySize === 1 ? 'person' : 'people' }}</span>
			<button type="button" class="round" :disabled="d.partySize <= 1" aria-label="One fewer" @click="setParty(d.partySize - 1)"><i class="bi bi-dash"></i></button>
			<button type="button" class="round on" :disabled="d.partySize >= 8" aria-label="One more" @click="setParty(d.partySize + 1)"><i class="bi bi-plus"></i></button>
		</div>

		<div class="plan-label">Food needs</div>
		<div class="d-flex flex-wrap gap-2 mb-3">
			<button v-for="f in FOOD" :key="f.id" type="button" class="zt-chip" :class="{ active: d.foodNeeds === f.id }" :aria-pressed="d.foodNeeds === f.id" @click="d.foodNeeds = f.id">{{ f.label }}</button>
		</div>

		<div class="plan-label">Heading out</div>
		<div class="d-flex flex-wrap gap-2 mb-2">
			<button type="button" class="zt-chip" :class="{ active: d.startAtLanding }" @click="trip.setStart(true)">{{ trip.landed ? 'Now' : 'At landing' }}</button>
			<button type="button" class="zt-chip" :class="{ active: !d.startAtLanding }" @click="trip.setStart(false)">Later</button>
		</div>
		<input v-if="!d.startAtLanding" type="datetime-local" class="form-control mb-1" aria-label="Start time (Singapore time)" :value="d.startLocal"
			:min="startMinLocal" :max="startMaxLocal" @change="trip.setStart(false, $event.target.value)" />
		<p class="tiny text-muted mb-3">{{ d.startAtLanding ? (trip.landed ? 'You have landed, so the plan starts from now.' : 'The plan starts when you land.') : 'For example after a nap or a shower at the airport.' }}</p>

		<div class="row g-3">
			<div class="col-6">
				<div class="plan-label">Pace</div>
				<select v-model="d.energy" class="form-select form-select-sm" aria-label="Pace">
					<option value="low">Relaxed</option>
					<option value="med">Medium</option>
					<option value="high">Packed</option>
				</select>
			</div>
			<div class="col-6">
				<div class="plan-label">Indoors</div>
				<select v-model="d.indoorPref" class="form-select form-select-sm" aria-label="Indoors">
					<option value="any">No preference</option>
					<option value="prefer">Prefer air-con</option>
					<option value="only">Indoor only</option>
				</select>
			</div>
		</div>
	</div>
</template>

<style scoped>
.stepper { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border: 2px solid var(--zt-line); border-radius: 14px; }
.round { width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--zt-line); background: var(--zt-card); color: var(--zt-ink); display: grid; place-items: center; }
.round.on { background: var(--zt-yellow); color: #111; }
.round:disabled { opacity: 0.4; }
</style>
