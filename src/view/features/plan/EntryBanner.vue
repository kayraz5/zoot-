<script setup>
import { computed } from 'vue'
import { usePassportStore } from '../../../model/stores/passport.js'
import { useTripStore } from '../../../model/stores/trip.js'

/**
 * Entry check from the profile (passport.canLeaveAirport). Warns, never blocks:
 * the traveller may already hold a visa.
 *   'no'  → needs a visa to leave the airport
 *   'ask' → may qualify for the 96 h transit scheme, not answered yet
 *   null  → no passport country set yet (gentle prompt)
 * Shows nothing for 'yes', or until the getter exists.
 */
const passport = usePassportStore()
const d = useTripStore().draft

const MESSAGES = {
	no: { tone: 'warn', icon: 'bi-exclamation-triangle-fill', text: 'Your passport may need a Singapore visa to leave the airport. Plan only if you have one.' },
	ask: { tone: 'warn', icon: 'bi-question-circle-fill', text: 'Check your entry status on your profile first.' },
	none: { tone: 'info', icon: 'bi-passport', text: 'Add your passport country on your profile to check you can leave the airport.' }
}
const message = computed(() => {
	const status = passport.canLeaveAirport
	if (status === undefined || status === 'yes') return null
	return MESSAGES[status ?? 'none'] || null
})
</script>

<template>
	<div v-if="message && !d.entryDismissed" class="entry" :class="message.tone" role="note">
		<i class="bi" :class="message.icon" aria-hidden="true"></i>
		<div class="flex-grow-1">
			<span>{{ message.text }}</span>
			<RouterLink to="/me" class="fw-800 ms-1">Go to profile <i class="bi bi-arrow-right"></i></RouterLink>
		</div>
		<button type="button" class="btn-close" aria-label="Dismiss" @click="d.entryDismissed = true"></button>
	</div>
</template>

<style scoped>
.entry {
	display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px;
	border: var(--zt-bw) solid var(--zt-line); border-radius: 16px; font-size: 0.86rem; color: #111;
}
.entry.warn { background: #fff1d6; }
.entry.warn > .bi { color: #b45309; }
.entry.info { background: var(--zt-yellow-pale); }
.entry > .bi { font-size: 1.1rem; flex: none; margin-top: 1px; }
.entry a { color: #111; white-space: nowrap; }
.entry .btn-close { flex: none; transform: scale(0.8); }
</style>
