<script setup>
import { ref } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { formatTime } from '../../../model/services/hours.js'
import BufferBar from '../BufferBar.vue'
import { hm, usePlanTime } from './planUi.js'

/** "You have 6H 02M to explore". Inline on phones (step 1), stacked with a share bar in the desktop sidebar. */
defineProps({ side: { type: Boolean, default: false } })
const trip = useTripStore()
const d = trip.draft
const { budget, tooShort, bufferMin, beyondForecast } = usePlanTime()
const showBuffers = ref(false)
const share = () => Math.max(0, Math.min(100, (100 * budget.value.usable_min) / Math.max(1, budget.value.window_min)))
</script>

<template>
	<section class="have-card" :class="{ tight: d.layoverSet && tooShort, side }">
		<template v-if="d.layoverSet">
			<div class="plan-label">You have</div>
			<div class="amount">
				<span class="big">{{ hm(budget.usable_min) }}</span><b class="small">to explore</b>
			</div>
			<p class="small fw-800 mb-1 mt-1">Be back at {{ trip.origin.short }} by {{ formatTime(budget.arriveByMs) }}</p>
			<div v-if="side" class="share mb-2" :title="`${budget.usable_min} of ${budget.window_min} min outside`"><span :style="{ width: share() + '%' }"></span></div>
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
</template>

<style scoped>
.have-card {
	background: var(--zt-yellow); color: #111; border: var(--zt-bw) solid var(--zt-line);
	border-radius: var(--zt-radius); padding: 16px; box-shadow: var(--zt-shadow);
}
.have-card .plan-label { color: #111; }
.have-card.tight { background: #ffd9c9; }
.amount { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.side .amount { flex-direction: column; align-items: flex-start; gap: 0; }
.big { font-family: var(--zt-font-display); font-size: 3.2rem; line-height: 0.9; }
.side .big { font-size: 4rem; }
.link-btn { border: 0; background: none; padding: 0; color: #111; font-size: 0.72rem; font-weight: 800; text-decoration: underline; }
.share { height: 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.12); overflow: hidden; }
.share span { display: block; height: 100%; background: #111; border-radius: 999px; }
</style>
