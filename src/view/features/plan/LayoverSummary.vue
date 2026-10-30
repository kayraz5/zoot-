<script setup>
import { computed } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { formatDuration, formatTime } from '../../../model/services/hours.js'
import { sgDay } from './planUi.js'

/** "Lands T3 → Departs T1" card with times; tapping it reopens the layover form. */
const emit = defineEmits(['edit'])
const trip = useTripStore()
const d = trip.draft
const sameDay = computed(() => sgDay(trip.arrivalMs) === sgDay(trip.mustReturnMs))
const tile = (o) => o.short.replace('Changi ', '')
const changesTerminal = computed(() => d.arrivalTerminal !== d.departureTerminal)
</script>

<template>
	<section class="zt-card p-3">
		<div class="plan-label">Your layover</div>
		<button type="button" class="plan-field-btn layover-btn" aria-label="Change your layover times and terminals" @click="emit('edit')">
			<span class="leg">
				<span class="leg-k"><i class="bi bi-airplane-engines"></i> Arrive</span>
				<span class="term-chip">{{ tile(trip.arrivalTerminal) }}</span>
				<b class="mono">{{ sgDay(trip.arrivalMs) }} · {{ formatTime(trip.arrivalMs) }}</b>
			</span>
			<i class="bi bi-arrow-right leg-arrow" aria-hidden="true"></i>
			<span class="leg">
				<span class="leg-k"><i class="bi bi-airplane"></i> Depart</span>
				<span class="term-chip out">{{ tile(trip.returnTo) }}</span>
				<b class="mono">{{ sameDay ? '' : sgDay(trip.mustReturnMs) + ' · ' }}{{ formatTime(trip.mustReturnMs) }}</b>
			</span>
			<i class="bi bi-pencil ms-auto" aria-hidden="true"></i>
		</button>
		<div class="meta tiny mt-2">
			<span><i class="bi bi-hourglass-split"></i> Layover {{ formatDuration(trip.layoverMin) }}</span>
			<span v-if="changesTerminal"><i class="bi bi-arrow-left-right"></i> Different departure terminal</span>
			<span v-if="d.originId === 'jewel'"><i class="bi bi-gem"></i> Starting at Jewel</span>
			<span v-else-if="d.landside"><i class="bi bi-door-open"></i> Already landside</span>
		</div>
	</section>
</template>

<style scoped>
.layover-btn { gap: 12px; }
.leg { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; }
.leg-k { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--zt-muted); }
.leg b { white-space: nowrap; font-size: 0.85rem; }
.term-chip {
	font-weight: 900; font-size: 1.05rem; line-height: 1; padding: 4px 9px; border-radius: 10px;
	border: 2px solid var(--zt-line); background: var(--zt-yellow); color: #111;
}
.term-chip.out { background: var(--zt-yellow-pale); }
.leg-arrow { color: var(--zt-muted); }
.meta { display: flex; gap: 12px; flex-wrap: wrap; color: var(--zt-muted); font-weight: 700; }
.meta .bi { margin-right: 3px; }
</style>
