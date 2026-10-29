<script setup>
import { computed, ref } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { formatTime } from '../../../model/services/hours.js'
import { FOOD } from './planUi.js'
import MoreOptionsFields from './MoreOptionsFields.vue'

/** "More options" row with a one-line summary: expands inline on wide screens, opens a bottom sheet on phones. */
const props = defineProps({ wide: { type: Boolean, default: false } })
const trip = useTripStore()
const d = trip.draft
const open = ref(false)

const summary = computed(() => {
	const parts = [`Walk ≤ ${d.maxWalk} min`, `${d.partySize} ${d.partySize === 1 ? 'person' : 'people'}`]
	if (d.foodNeeds !== 'none') parts.push(FOOD.find((f) => f.id === d.foodNeeds)?.label)
	if (!d.startAtLanding) parts.push(`out at ${formatTime(trip.startMs)}`)
	return parts.join(' · ')
})
const chevron = computed(() => (props.wide ? (open.value ? 'bi-chevron-up' : 'bi-chevron-down') : 'bi-chevron-right'))
</script>

<template>
	<section class="zt-card options">
		<button type="button" class="options-row" :aria-expanded="open" @click="open = !open">
			<span class="plan-label mb-0">More options</span>
			<span class="tiny flex-grow-1 text-start ms-2">{{ summary }}</span>
			<i class="bi" :class="chevron"></i>
		</button>
		<MoreOptionsFields v-if="wide && open" class="px-3 pb-3" />
	</section>

	<div v-if="!wide && open" class="sheet-scrim" @click.self="open = false">
		<div class="sheet zt-card" role="dialog" aria-modal="true" aria-labelledby="opts-h">
			<div class="grabber"></div>
			<div class="d-flex justify-content-between align-items-center mb-2">
				<h2 id="opts-h" class="plan-step-h sheet-h">More options</h2>
				<button type="button" class="btn-close" aria-label="Close" @click="open = false"></button>
			</div>
			<MoreOptionsFields />
			<button type="button" class="btn btn-primary btn-lg w-100 mt-3" @click="open = false">Done</button>
		</div>
	</div>
</template>

<style scoped>
.options { padding: 0; overflow: hidden; }
.options-row { display: flex; align-items: center; width: 100%; padding: 14px 16px; border: 0; background: none; color: var(--zt-ink); }
.sheet-scrim {
	position: fixed; inset: 0; z-index: 1400; display: grid; place-items: end center;
	background: rgba(17, 17, 17, 0.45); padding: 16px;
}
.sheet { width: min(560px, 100%); padding: 12px 16px 16px; border-radius: 24px 24px 18px 18px; max-height: 85vh; overflow-y: auto; }
.sheet-h { font-size: 1.6rem; }
.grabber { width: 44px; height: 5px; border-radius: 999px; background: var(--zt-soft-line); margin: 0 auto 10px; }
</style>
