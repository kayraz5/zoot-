<script setup>
import { computed } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { formatDuration, formatTime } from '../../../model/services/hours.js'
import { sgDay } from './planUi.js'

/** "Lands → Departs" card; tapping it reopens the layover dialog. */
const emit = defineEmits(['edit'])
const trip = useTripStore()
const d = trip.draft
const sameDay = computed(() => sgDay(trip.arrivalMs) === sgDay(trip.mustReturnMs))
</script>

<template>
	<section class="zt-card p-3">
		<div class="plan-label">Your layover</div>
		<button type="button" class="plan-field-btn layover-btn" aria-label="Change your layover times" @click="emit('edit')">
			<span class="leg">
				<span class="leg-k"><i class="bi bi-airplane-engines"></i> Lands</span>
				<b class="mono">{{ d.layoverSet ? `${sgDay(trip.arrivalMs)} · ${formatTime(trip.arrivalMs)}` : 'Add times' }}</b>
			</span>
			<i class="bi bi-arrow-right leg-arrow" aria-hidden="true"></i>
			<span class="leg">
				<span class="leg-k"><i class="bi bi-airplane"></i> Departs</span>
				<b class="mono">{{ d.layoverSet ? `${sameDay ? '' : sgDay(trip.mustReturnMs) + ' · '}${formatTime(trip.mustReturnMs)}` : '—' }}</b>
			</span>
			<i class="bi bi-chevron-right ms-auto" aria-hidden="true"></i>
		</button>
		<div v-if="d.layoverSet" class="meta tiny mt-2">
			<span><i class="bi bi-hourglass-split"></i> Layover {{ formatDuration(trip.layoverMin) }}</span>
		</div>
	</section>
</template>

<style scoped>
.layover-btn { gap: 12px; }
.leg { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.leg-k { font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--zt-muted); }
.leg b { white-space: nowrap; font-size: 0.88rem; }
.leg-arrow { color: var(--zt-muted); }
.meta { color: var(--zt-muted); font-weight: 700; white-space: nowrap; }
.meta .bi { margin-right: 3px; }
</style>
