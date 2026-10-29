<script setup>
import { computed, onMounted, ref } from 'vue'
import { catalog } from '../../../model/services/catalog.js'
import { distanceM } from '../../../model/services/travel.js'

/** Choose a catalog place to add or swap in. Nearest first; search by name, area or tag. */
const props = defineProps({
	title: { type: String, default: 'Pick a place' },
	near: { type: Object, required: true },
	exclude: { type: Object, default: () => new Set() },
	busy: { type: Boolean, default: false }
})
const emit = defineEmits(['pick', 'close'])

const q = ref('')
const input = ref(null)
onMounted(() => input.value?.focus())

const results = computed(() => {
	const needle = q.value.trim().toLowerCase()
	return catalog.value
		.filter((p) => !props.exclude.has(p.id))
		.filter((p) => !needle || [p.name, p.area, ...(p.tags || [])].some((s) => s?.toLowerCase().includes(needle)))
		.map((p) => ({ p, d: distanceM(props.near, p) }))
		.sort((a, b) => a.d - b.d)
		.slice(0, 12)
})

const away = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`)
</script>

<template>
	<div class="picker mt-3">
		<div class="d-flex justify-content-between align-items-center mb-2">
			<b class="small">{{ title }}</b>
			<button type="button" class="btn-close" aria-label="Close" @click="emit('close')"></button>
		</div>
		<input ref="input" v-model="q" type="search" class="form-control form-control-sm mb-2"
			placeholder="Search places, areas or tags (e.g. hawker)" />
		<ul class="list-unstyled mb-0">
			<li v-for="{ p, d } in results" :key="p.id">
				<button type="button" class="pick" :disabled="busy" @click="emit('pick', p)">
					<span class="flex-grow-1 text-start">
						<span class="fw-800 d-block">{{ p.name }}</span>
						<span class="tiny text-muted">{{ p.area }} · {{ p.duration_min }} min · <i class="bi" :class="p.indoor ? 'bi-house' : 'bi-sun'"></i> {{ p.indoor ? 'Indoor' : 'Outdoor' }}</span>
					</span>
					<span class="tiny mono text-muted text-nowrap">{{ away(d) }}</span>
				</button>
			</li>
			<li v-if="!results.length" class="tiny text-muted py-2">No places match “{{ q }}”.</li>
		</ul>
		<p class="tiny text-muted mt-2 mb-0">The rest of the plan is re-timed. Anything that would make you late is refused.</p>
	</div>
</template>

<style scoped>
.picker {
	border-top: 2px dashed var(--zt-soft-line);
	padding-top: 12px;
}

ul {
	max-height: 320px;
	overflow-y: auto;
}

.pick {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 8px 10px;
	margin-bottom: 6px;
	border: 2px solid var(--zt-line);
	border-radius: 12px;
	background: var(--zt-card);
	color: var(--zt-ink);
}

.pick:hover:not(:disabled) {
	background: var(--zt-yellow-pale);
}

.pick:disabled {
	opacity: 0.5;
}
</style>
