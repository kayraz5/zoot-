<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '../../../model/stores/ui.js'

// Haze layer + lightning flashes, drawn over the map pages only.

const SKY_PAGES = ['map']
const HAZE_STARTS_AT_PSI = 100   // no haze layer at or below this (PSI "Moderate" or better)

const ui = useUiStore()
const route = useRoute()
const onSkyPage = computed(() => SKY_PAGES.includes(route.name))

// ---------------------------------------------------------------
// Haze: fades in from nothing at PSI 100 to full strength at PSI 200
// ---------------------------------------------------------------
const hazeOpacity = computed(() => {
	if (!onSkyPage.value) return 0
	const psi = ui.shownHaze?.psi
	if (psi == null || psi <= HAZE_STARTS_AT_PSI) return 0
	const strength = Math.min((psi - HAZE_STARTS_AT_PSI) / 100, 1)   // 0 to 1
	return strength * 0.95
})

// The cloud blobs: how far down the screen, how big, how fast they drift,
// and a negative delay so they are already spread out when the page loads.
const CLOUDS = [
	{ top: 0,  size: 640, speed: 80, delay: -10 },
	{ top: 14, size: 520, speed: 62, delay: -40 },
	{ top: 30, size: 700, speed: 95, delay: -25 },
	{ top: 46, size: 560, speed: 70, delay: -55 },
	{ top: 60, size: 680, speed: 88, delay: -5 },
	{ top: 76, size: 540, speed: 66, delay: -35 },
	{ top: 88, size: 620, speed: 78, delay: -60 }
]

// ---------------------------------------------------------------
// Lightning: a flash at random gaps of 2.5 to 7.5 seconds
// ---------------------------------------------------------------
const lightningOn = computed(() => onSkyPage.value && ui.shownLightning?.nearby === true)

const flashKey = ref(0)       // changing this restarts the flash animation
const boltLeft = ref(50)      // where the bolt appears across the screen (%)
let timer = null

function scheduleFlash() {
	timer = setTimeout(() => {
		boltLeft.value = 10 + Math.random() * 80
		flashKey.value++
		scheduleFlash()
	}, 2500 + Math.random() * 5000)
}

function stopFlashes() {
	clearTimeout(timer)
	timer = null
}

watch(lightningOn, (on) => {
	stopFlashes()
	if (on) scheduleFlash()
}, { immediate: true })

onUnmounted(stopFlashes)
</script>

<template>
		<!-- Haze: a tint plus big soft clouds drifting across -->
	<div v-if="hazeOpacity > 0" class="haze" :style="{ opacity: hazeOpacity }" aria-hidden="true">
		<div v-for="(cloud, i) in CLOUDS" :key="i" class="cloud" :style="{
			top: cloud.top + '%',
			width: cloud.size + 'px',
			height: cloud.size * 0.55 + 'px',
			animationDuration: cloud.speed + 's',
			animationDelay: cloud.delay + 's'
		}"></div>
	</div>

	<!-- Lightning: white flash plus a bolt. The :key restarts the animation each time. -->
	<div v-if="lightningOn && flashKey > 0" :key="flashKey" class="storm" aria-hidden="true">
		<div class="flash"></div>
		<svg class="bolt" :style="{ left: boltLeft + '%' }" viewBox="0 0 40 120">
			<polygon points="24,0 6,64 20,64 12,120 36,48 22,48 30,0" />
		</svg>
	</div>
</template>

<style scoped>
.haze,
.storm {
	position: fixed;
	inset: 0;
	pointer-events: none;
	/* clicks go through */
	overflow: hidden;
}

/* ---------- Haze ---------- */
.haze {
	z-index: 48;
	/* behind the rain (50) */
	/* A warm tint, a little thicker toward the bottom like a low haze bank. */
	background: linear-gradient(to bottom, rgba(200, 170, 110, 0.25), rgba(200, 170, 110, 0.5));
}

/* One cloud: a wide soft oval, solid in the middle and fading to nothing at the edges. */
.cloud {
	position: absolute;
	left: 0;
	border-radius: 50%;
	background: radial-gradient(ellipse at center,
			rgba(240, 220, 175, 0.9) 0%,
			rgba(240, 220, 175, 0.55) 35%,
			rgba(240, 220, 175, 0) 70%);
	will-change: transform;
	animation-name: cloud-pass;
	animation-timing-function: linear;
	animation-iteration-count: infinite;
}

/* Drift from off the left edge to off the right edge. */
@keyframes cloud-pass {
	from { transform: translateX(-50vw); }
	to   { transform: translateX(120vw); }
}

/* ---------- Lightning ---------- */
.storm {
	z-index: 52;
}

/* in front of the rain (50) */

.flash {
	position: absolute;
	inset: 0;
	background: #fff;
	opacity: 0;
	animation: flash 0.9s ease-out forwards;
}

.bolt {
	position: absolute;
	top: 0;
	width: 60px;
	height: 180px;
	fill: #fffbe0;
	filter: drop-shadow(0 0 8px #ffe66b);
	opacity: 0;
	animation: bolt 0.9s ease-out forwards;
}

/* Two quick flashes, then fade. */
@keyframes flash {
	0% {
		opacity: 0;
	}

	8% {
		opacity: 0.75;
	}

	16% {
		opacity: 0.1;
	}

	24% {
		opacity: 0.6;
	}

	100% {
		opacity: 0;
	}
}

@keyframes bolt {
	0% {
		opacity: 0;
	}

	8% {
		opacity: 1;
	}

	30% {
		opacity: 0.8;
	}

	100% {
		opacity: 0;
	}
}

/* Flashing can be uncomfortable for some people, so skip it if asked. */
@media (prefers-reduced-motion: reduce) {
	.storm {
		display: none;
	}

	.cloud { animation-play-state: paused; }

}
</style>