<script setup>
import { computed } from 'vue'
import { formatDuration, formatTime } from '../../model/services/hours.js'

/** The buffers a traveller has to trust, as one proportional bar. With startMs, each part gets clock times. */
const props = defineProps({
	windowMin: Number, exitMin: Number, outMin: Number, reentryMin: Number, safetyMin: Number,
	startMs: { type: Number, default: null }
})
const segs = computed(() => {
	const spare = Math.max(0, props.windowMin - props.exitMin - props.outMin - props.reentryMin - props.safetyMin)
	let t = props.startMs
	return [
		{ key: 'exit', label: 'Exit immigration', min: props.exitMin, cls: 'exit' },
		{ key: 'out', label: 'Out exploring', min: props.outMin, cls: 'out' },
		{ key: 'spare', label: 'Spare', min: spare, cls: 'spare' },
		{ key: 'reentry', label: 'Check-in + security', min: props.reentryMin, cls: 'reentry' },
		{ key: 'safety', label: 'Safety buffer', min: props.safetyMin, cls: 'safety' }
	]
		.map((s) => {
			if (t == null) return s
			const from = t
			t += s.min * 60000
			return { ...s, from, to: t }
		})
		.filter((s) => s.min > 0)
})
const span = (s) => (s.from == null ? '' : `${formatTime(s.from)}–${formatTime(s.to)}`)
</script>

<template>
	<div>
		<div class="bar" role="img" :aria-label="segs.map((s) => `${s.label} ${span(s)} ${formatDuration(s.min)}`).join(', ')">
			<div v-for="s in segs" :key="s.key" class="seg" :class="s.cls" :style="{ flexGrow: s.min }"
				:title="`${s.label}: ${span(s) ? span(s) + ', ' : ''}${formatDuration(s.min)}`"></div>
		</div>
		<div class="legend" :class="{ timed: startMs != null }">
			<span v-for="s in segs" :key="s.key">
				<i :class="s.cls"></i>{{ s.label }}
				<template v-if="s.from != null"><b class="mono">{{ span(s) }}</b><span class="dur">{{ formatDuration(s.min) }}</span></template>
				<b v-else class="mono">{{ formatDuration(s.min) }}</b>
			</span>
		</div>
	</div>
</template>

<style scoped>
.bar {
	display: flex;
	height: 22px;
	border-radius: 999px;
	overflow: hidden;
	border: var(--zt-bw) solid var(--zt-line);
	background: var(--zt-card);
}

.seg {
	min-width: 8px;
	border-right: 2px solid var(--zt-line);
}

.seg:last-child {
	border-right: none;
}

.exit,
.legend i.exit {
	background: #cfc8ad;
}

.out,
.legend i.out {
	background: var(--zt-yellow);
}

.spare,
.legend i.spare {
	background: repeating-linear-gradient(45deg, var(--zt-yellow-pale), var(--zt-yellow-pale) 5px, #fff 5px, #fff 10px);
}

.reentry,
.legend i.reentry {
	background: #111;
}

.safety,
.legend i.safety {
	background: var(--zt-pink);
}

[data-bs-theme='dark'] .reentry,
[data-bs-theme='dark'] .legend i.reentry {
	background: #6b6b6b;
  }

.legend {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 14px;
	margin-top: 10px;
	font-size: 0.76rem;
	color: var(--zt-muted);
}

/* With clock times, one row per part reads like a schedule. */
.legend.timed {
	display: grid;
	gap: 4px;
}

.legend.timed > span {
	display: grid;
	grid-template-columns: auto 1fr auto auto;
	align-items: center;
	gap: 0 8px;
}

.legend.timed i {
	margin-right: 0;
}

.legend .dur {
	min-width: 5.5em;
	text-align: right;
}

.legend i {
	display: inline-block;
	width: 12px;
	height: 12px;
	border-radius: 4px;
	margin-right: 5px;
	vertical-align: -1px;
	border: 1.5px solid var(--zt-line);
}

.legend b {
	color: var(--zt-ink);
}
</style>
