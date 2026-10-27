<script setup>
import { computed, ref } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { ORIGINS } from '../../../model/data/origins.js'
import { distanceM } from '../../../model/services/travel.js'

/** "Starting from": My location + T1–T4 + Jewel. My location snaps to the nearest terminal. */
const trip = useTripStore()
const ui = useUiStore()
const d = trip.draft

const TERMINAL_ORDER = ['changi-t1', 'changi-t2', 'changi-t3', 'changi-t4', 'jewel']
const terminals = TERMINAL_ORDER.map((id) => ORIGINS.find((o) => o.id === id)).filter(Boolean)
	.map((o) => ({ ...o, tile: o.id === 'jewel' ? 'Jewel' : o.short.replace('Changi ', '') }))

/** Set when the origin came from "My location"; that tile is then the selected one. */
const viaLocation = ref(false)
const locating = ref(false)
const nearTile = computed(() => terminals.find((o) => o.id === d.originId)?.tile)

function pick(id) {
	d.originId = id
	viaLocation.value = false
}

function locate() {
	if (!navigator.geolocation) return ui.toast('Location is not available on this device. Pick your terminal instead.', 'warning')
	locating.value = true
	viaLocation.value = false
	navigator.geolocation.getCurrentPosition(
		(pos) => {
			locating.value = false
			const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
			const nearest = terminals.map((o) => ({ o, dist: distanceM(here, o) })).sort((a, b) => a.dist - b.dist)[0]
			if (!nearest || nearest.dist > 3000) {
				ui.toast(`You're about ${Math.round((nearest?.dist ?? 0) / 1000)} km from Changi. Pick the terminal your flight leaves from.`, 'warning', 5000)
				return
			}
			pick(nearest.o.id)
			viaLocation.value = true
		},
		() => {
			locating.value = false
			ui.toast('Could not get your location. Pick your terminal instead.', 'warning')
		},
		{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
	)
}
</script>

<template>
	<section class="zt-card p-3">
		<div class="plan-label">Starting from</div>
		<div class="terminal-grid">
			<button type="button" class="terminal locate" :class="{ active: viaLocation }" :disabled="locating" :aria-pressed="viaLocation" @click="locate">
				<i class="bi" :class="locating ? 'bi-hourglass-split' : 'bi-crosshair'"></i>
				<span>{{ locating ? 'Locating' : 'My location' }}</span>
				<small v-if="viaLocation && nearTile">Near {{ nearTile }}</small>
			</button>
			<button v-for="o in terminals" :key="o.id" type="button" class="terminal" :class="{ active: !viaLocation && d.originId === o.id }"
				:aria-pressed="!viaLocation && d.originId === o.id" @click="pick(o.id)">
				<i class="bi" :class="o.id === 'jewel' ? 'bi-gem' : 'bi-airplane-engines'"></i>
				<span>{{ o.tile }}</span>
			</button>
		</div>
	</section>
</template>

<style scoped>
/* 3×2 on phones, one row of 6 on wide screens. */
.terminal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.is-wide .terminal-grid { grid-template-columns: repeat(6, 1fr); }
.terminal {
	display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 10px 4px; min-height: 64px;
	border: 2px solid var(--zt-line); border-radius: 14px; background: var(--zt-card); color: var(--zt-ink);
	font-weight: 800; font-size: 0.72rem; text-transform: uppercase;
}
.terminal i { font-size: 1.1rem; }
.terminal small { font-size: 0.62rem; font-weight: 700; text-transform: none; opacity: 0.8; }
.terminal.locate { border-style: dashed; }
.terminal.locate.active { border-style: solid; }
.terminal:disabled { opacity: 0.7; }
.terminal.active { background: var(--zt-yellow); color: #111; box-shadow: 0 3px 0 var(--zt-shadow-color); transform: translateY(-2px); }
</style>
