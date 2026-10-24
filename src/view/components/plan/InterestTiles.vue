<script setup>
import { useTripStore } from '../../../model/stores/trip.js'
import { TILES } from './planUi.js'

/** "What are you into?": six tiles over the catalog tags (pre-picking lives in planUi.js). */
defineProps({ wide: { type: Boolean, default: false } })
const trip = useTripStore()
const d = trip.draft

const isOn = (t) => t.tags.some((tag) => d.interests.includes(tag))
function toggle(t) {
	trip.setInterests(isOn(t) ? d.interests.filter((i) => !t.tags.includes(i)) : [...d.interests, ...t.tags])
}
</script>

<template>
	<section :class="{ 'zt-card p-3': wide }">
		<div class="d-flex justify-content-between align-items-baseline flex-wrap gap-1">
			<component :is="wide ? 'div' : 'h2'" :class="wide ? 'plan-label' : 'plan-step-h'">What are you into?</component>
			<span class="tiny text-muted">{{ d.interestsTouched ? 'Tap to change.' : 'Pre-picked from your style quiz. Tap to change.' }}</span>
		</div>
		<div class="tile-grid mt-2">
			<button v-for="t in TILES" :key="t.id" type="button" class="plan-pick tile" :class="{ active: isOn(t) }" :aria-pressed="isOn(t)" @click="toggle(t)">
				<i class="bi" :class="t.icon"></i>
				<span>{{ t.label }}</span>
				<i v-if="isOn(t)" class="bi bi-check-circle-fill plan-check"></i>
			</button>
		</div>
	</section>
</template>

<style scoped>
.tile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.is-wide .tile-grid { grid-template-columns: repeat(3, 1fr); }
.is-wide .tile { flex-direction: row; align-items: center; min-height: 0; padding: 10px 12px; }
</style>
