<script setup>
import { computed, ref } from 'vue'
import { formatDuration, formatTime } from '../../model/services/hours.js'
import { describeCode } from '../../model/services/weather.js'
import { tick } from '../../model/services/clock.js'
import { useUiStore } from '../../model/stores/ui.js'

/**
 * EDITOR: KAYRA
 * Layover card
 */
const props = defineProps({
	mission: { type: Object, required: true }
})

const MIN = 60000
const ui = useUiStore()
const m = computed(() => props.mission)
const airport = computed(() => m.value.origin?.kind === 'airport')
const ret = computed(() => m.value.legs.at(-1))
const startMs = computed(() => Date.parse(m.value.start_iso))
const endMs = computed(() => Date.parse(m.value.must_return_iso))
const span = computed(() => Math.max(1, endMs.value - startMs.value))
const visits = computed(() => m.value.legs.filter((l) => l.kind === 'visit' && l.status !== 'skipped'))
const pct = (ms) => Math.min(100, Math.max(0, (100 * (ms - startMs.value)) / span.value))

/** Planned schedule. "Head back by" is the latest leave time that still makes arrive_by. */
const segs = computed(() => {
	const b = m.value.buffers
	const exitEnd = startMs.value + b.exit_min * MIN
	const arriveBy = Date.parse(ret.value.arrive_by)
	const headBack = Math.min(arriveBy, Math.max(exitEnd, arriveBy - ret.value.travel_min * MIN))
	const checkinEnd = arriveBy + b.reentry_min * MIN
	return [
		{ key: 'exit', label: airport.value ? 'Immigration' : 'Get ready', from: startMs.value, to: exitEnd },
		{ key: 'explore', label: 'Explore the city', from: exitEnd, to: headBack },
		{ key: 'travel', label: airport.value ? 'Travel to airport' : 'Travel back', from: headBack, to: arriveBy },
		{ key: 'checkin', label: 'Check-in + security', from: arriveBy, to: checkinEnd },
		{ key: 'gate', label: airport.value ? 'Gate buffer' : 'Safety buffer', from: checkinEnd, to: endMs.value }
	]
		.map((s) => ({ ...s, min: Math.round((s.to - s.from) / MIN) }))
		.filter((s) => s.min > 0)
})
const explore = computed(() => segs.value.find((s) => s.key === 'explore'))
const headBackMs = computed(() => explore.value?.to ?? Date.parse(ret.value.arrive_by))
/** Faint ticks on the bar where each planned stop begins. */
const stopTicks = computed(() => visits.value.map((l) => ({ id: l.place_id, left: pct(Date.parse(l.arrive_iso)), done: l.status === 'stamped' })))

// Weather
const weather = computed(() => {
	if (ui.forceRain) return { icon: 'bi-cloud-rain-heavy', temp: null, prob: 90 }
	if (!ui.weather) return null
	const hour = ui.weather.hours?.find((h) => tick.value >= h.ms && tick.value < h.ms + 3600000)
	return { icon: describeCode(ui.weather.current.code).icon, temp: Math.round(ui.weather.current.temp), prob: hour?.prob ?? 0 }
})

// fOLLOW the clock
const scrubMs = ref(null)
const nowMs = computed(() => tick.value)
const nowInWindow = computed(() => nowMs.value >= startMs.value && nowMs.value <= endMs.value)
const following = computed(() => scrubMs.value == null)
const focusMs = computed(() => scrubMs.value ?? Math.min(endMs.value, Math.max(startMs.value, nowMs.value)))
const markerPct = computed(() => pct(focusMs.value))
const focusSeg = computed(() => segs.value.find((s) => focusMs.value >= s.from && focusMs.value < s.to) || segs.value.at(-1))

const markerLabel = computed(() => {
	if (!following.value) return formatTime(focusMs.value)
	if (nowMs.value < startMs.value) return `Starts ${formatTime(startMs.value)}`
	if (nowMs.value > endMs.value) return 'Departed'
	return `Now ${formatTime(nowMs.value)}`
})
// Keep the moving label clear of the fixed end labels.
const hideStart = computed(() => markerPct.value < 24)
const hideEnd = computed(() => markerPct.value > 76)

/** What the plan has the traveller doing at the focus time. */
const doing = computed(() => {
	const t = focusMs.value
	const seg = focusSeg.value
	if (!seg) return { icon: 'bi-clock', text: '' }
	if (seg.key === 'exit') return { icon: 'bi-passport', text: seg.label }
	if (seg.key === 'travel') return { icon: 'bi-train-front', text: seg.label }
	if (seg.key === 'checkin') return { icon: 'bi-shield-check', text: seg.label }
	if (seg.key === 'gate') return { icon: 'bi-airplane', text: airport.value ? 'At the gate' : seg.label }
	const at = visits.value.find((l) => t >= Date.parse(l.arrive_iso) && t < Date.parse(l.depart_iso))
	if (at) return { icon: 'bi-geo-alt-fill', text: `At ${at.name}`, sub: `until ${formatTime(at.depart_iso)}` }
	const next = visits.value.find((l) => Date.parse(l.arrive_iso) > t)
	if (next) return { icon: 'bi-signpost', text: `On the way to ${next.name}`, sub: `arrive ${formatTime(next.arrive_iso)}` }
	return { icon: 'bi-cup-hot', text: 'Free time before heading back' }
})

function onScrub(e) {
	const v = Number(e.target.value)
	// Landing back on the live time resumes following the clock.
	scrubMs.value = nowInWindow.value && Math.abs(v - nowMs.value) < 5 * MIN ? null : v
}

const open = ref(false)
</script>

<template>
	<section class="zt-card layover" aria-label="Layover timeline">
		<!-- Summary -->
		<header class="head">
			<div class="min-w-0">
				<div class="eyebrow">Free time to explore</div>
				<div class="big">{{ formatDuration(explore?.min ?? 0) }}</div>
				<div class="sub">
					<span>Head back by <b class="mono">{{ formatTime(headBackMs) }}</b></span>
					<span>{{ airport ? 'Flight' : 'Due back' }} <b class="mono">{{ formatTime(endMs) }}</b></span>
				</div>
			</div>
			<div v-if="weather" class="wx">
				<i class="bi" :class="weather.icon"></i>
				<span v-if="weather.temp != null" class="mono">{{ weather.temp }}°C</span>
				<span class="divider" aria-hidden="true"></span>
				<span class="mono">Rain {{ weather.prob }}%</span>
			</div>
		</header>

		<!-- Timeline bar, also the scrubber -->
		<div class="track">
			<div class="bar" aria-hidden="true">
				<div v-for="s in segs" :key="s.key" class="seg" :class="s.key" :style="{ flexGrow: s.min }"></div>
				<span v-for="t in stopTicks" :key="t.id" class="tick" :class="{ done: t.done }" :style="{ left: t.left + '%' }"></span>
			</div>
			<div class="marker" :class="{ scrubbing: !following }" :style="{ left: markerPct + '%' }" aria-hidden="true"></div>
			<input class="scrubber" type="range" :min="startMs" :max="endMs" :step="5 * MIN" :value="focusMs" @input="onScrub"
				aria-label="Scrub through your layover" :aria-valuetext="`${formatTime(focusMs)}: ${doing.text}`" />
		</div>
		<div class="ends">
			<span class="mono" :class="{ gone: hideStart }">{{ formatTime(startMs) }} {{ airport ? 'land' : 'start' }}</span>
			<span class="now-label mono" :style="{ left: Math.min(88, Math.max(12, markerPct)) + '%' }">▲ {{ markerLabel }}</span>
			<span class="mono" :class="{ gone: hideEnd }">{{ formatTime(endMs) }} {{ airport ? 'depart' : 'due' }}</span>
		</div>

		<!-- What's happening at the focus time -->
		<div class="status">
			<i class="bi" :class="doing.icon" aria-hidden="true"></i>
			<span class="min-w-0 text-truncate"><b>{{ doing.text }}</b><span v-if="doing.sub" class="muted"> {{ doing.sub }}</span></span>
			<button v-if="!following && nowInWindow" type="button" class="link" @click="scrubMs = null">Back to now</button>
			<span v-else-if="following && nowInWindow" class="hint">Drag the bar to look ahead</span>
		</div>

		<!-- Details -->
		<button type="button" class="disclosure" :aria-expanded="open" aria-controls="layover-rows" @click="open = !open">
			<span>Timeline details</span>
			<i class="bi bi-chevron-down" :class="{ flip: open }" aria-hidden="true"></i>
		</button>
		<ul v-show="open" id="layover-rows" class="rows">
			<li v-for="s in segs" :key="s.key" class="row-line" :class="{ focus: focusSeg?.key === s.key }">
				<i class="swatch" :class="s.key" aria-hidden="true"></i>
				<span class="name">{{ s.label }}</span>
				<span class="when mono">{{ formatTime(s.from) }} – {{ formatTime(s.to) }}</span>
				<span class="dur mono">{{ formatDuration(s.min) }}</span>
			</li>
		</ul>
	</section>
</template>

<style scoped>
.layover { padding: 18px 18px 6px; }
.min-w-0 { min-width: 0; }
.muted { color: var(--zt-muted); font-weight: 500; }

/* Summary */
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.eyebrow { font-size: 0.8rem; color: var(--zt-muted); font-weight: 600; }
.big { font-family: var(--zt-font-head); font-weight: 700; font-size: clamp(2.1rem, 9vw, 2.9rem); line-height: 1.02; letter-spacing: -0.01em; margin: 2px 0 4px; }
[data-bs-theme='dark'] .big { color: var(--zt-yellow); }
/* Two unbreakable facts that wrap as units, never mid-phrase. */
.sub { display: flex; flex-wrap: wrap; column-gap: 14px; row-gap: 2px; font-size: 0.88rem; }
.sub > span { white-space: nowrap; }
.sub > span + span { color: var(--zt-muted); }
.sub b { font-weight: 800; color: var(--zt-ink); }
.sep { color: var(--zt-muted); margin: 0 4px; }
.wx {
	display: inline-flex; align-items: center; gap: 8px; flex: none; white-space: nowrap;
	padding: 6px 12px; border-radius: 999px; font-size: 0.82rem; font-weight: 700;
	background: var(--zt-yellow-pale); color: #111;
}
[data-bs-theme='dark'] .wx { background: rgba(255, 255, 255, 0.08); color: var(--zt-ink); }
.wx .divider { width: 1px; height: 14px; background: currentColor; opacity: 0.25; }

/* One continuous bar: square segment ends, hairline joins, a single framed strip. */
.track { position: relative; margin-top: 18px; height: 22px; }
.bar {
	position: absolute; inset: 4px 0; display: flex; overflow: hidden;
	border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.seg { height: 100%; min-width: 4px; }
.seg + .seg { box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.18); }
.exit { background: #b9b3a1; }
.explore { background: var(--zt-yellow); }
.travel { background: repeating-linear-gradient(-45deg, var(--zt-yellow) 0 4px, #3a3a3a 4px 7px); }
.checkin { background: #6a6a6a; }
.gate { background: var(--zt-pink); }
.tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(0, 0, 0, 0.28); }
.tick.done { background: rgba(0, 0, 0, 0.55); }

.marker {
	position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px;
	background: var(--zt-ink); pointer-events: none; transition: left 0.12s ease-out;
}
.marker::before {
	content: ''; position: absolute; left: 50%; top: -3px; width: 8px; height: 8px; transform: translateX(-50%);
	background: var(--zt-ink); border: 2px solid var(--zt-card); border-radius: 50%;
}
.marker.scrubbing { background: var(--zt-pink); }
.marker.scrubbing::before { background: var(--zt-pink); }

/* Invisible range input over the bar: native drag, touch and keyboard for free. */
.scrubber { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
.track:focus-within .bar { box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 0 0 3px var(--zt-yellow-soft); }

.ends { position: relative; display: flex; justify-content: space-between; height: 1.3em; margin-top: 6px; font-size: 0.74rem; color: var(--zt-muted); }
.ends .gone { visibility: hidden; }
.now-label { position: absolute; top: 0; transform: translateX(-50%); color: var(--zt-ink); font-weight: 800; white-space: nowrap; }

/* Status line */
.status { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.86rem; }
.status .bi { color: var(--zt-muted); flex: none; }
.status .link { margin-left: auto; flex: none; border: 0; background: none; padding: 0; font-size: 0.8rem; font-weight: 800; color: var(--zt-ink); text-decoration: underline; text-underline-offset: 2px; }
.status .hint { margin-left: auto; flex: none; font-size: 0.74rem; color: var(--zt-muted); }

/* Details */
.disclosure {
	display: flex; justify-content: space-between; align-items: center; width: calc(100% + 36px);
	margin: 14px -18px 0; padding: 12px 18px; border: 0; border-top: 1px solid var(--zt-soft-line);
	background: none; color: var(--zt-ink); font-size: 0.82rem; font-weight: 800;
}
.disclosure .bi { transition: transform 0.15s; }
.disclosure .bi.flip { transform: rotate(180deg); }
/* Simple rows, as in the mockup: dot · name · time range · duration; the current part is highlighted. */
.rows { list-style: none; margin: 0 -10px; padding: 0 0 12px; }
.row-line {
	display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 5.5em; align-items: center; column-gap: 12px;
	padding: 10px; border-radius: 10px; font-size: 0.92rem;
}
.row-line.focus { background: var(--zt-yellow-pale); color: #111; font-weight: 800; }
[data-bs-theme='dark'] .row-line.focus { background: rgba(255, 204, 0, 0.12); color: var(--zt-yellow); }
.name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { color: var(--zt-muted); }
.row-line.focus .when { color: inherit; }
.dur { text-align: right; color: var(--zt-muted); }
.row-line.focus .dur { color: inherit; }
.swatch { width: 12px; height: 12px; border-radius: 50%; }
@media (max-width: 420px) {
	.layover { padding: 16px 14px 4px; }
	.disclosure { width: calc(100% + 28px); margin: 12px -14px 0; padding: 12px 14px; }
	.row-line { grid-template-columns: 10px minmax(0, 1fr) auto 4.8em; column-gap: 8px; font-size: 0.84rem; }
	.status .hint { display: none; }
}
</style>
