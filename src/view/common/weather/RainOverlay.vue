<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '../../../model/stores/ui.js'

// Draws falling raindrops over the whole screen when it is raining.

const DROP_COUNT = 100; // how many raindrops to draw

const ui = useUiStore();

// The pages where rain should appear (route names from the router file).
const RAIN_PAGES = ['map']

const route = useRoute();
const onRainPage = computed(() => RAIN_PAGES.includes(route.name));

// Rain only falls when measurable rain is happening right now. The hourly
// chance of rain is just a forecast, so it is not used here.
const rainingNow = computed(() => ui.forceRain || (ui.weather?.current?.mm ?? 0) > 0);

const isRaining = computed(() => onRainPage.value && rainingNow.value);

// Make each raindrop slightly different so the rain looks natural.
// This runs once, not on every update.
const drops = Array.from({ length: DROP_COUNT }, () => {
	return {
		left: Math.random() * 100, // position across the screen (%)
		delay: Math.random() * 2, // start time offset (seconds)
		duration: 0.6 + Math.random() * 0.6, // fall speed (seconds)
		opacity: 0.3 + Math.random() * 0.4
	};
})
</script>

<template>
	<div v-if="isRaining" class="rain" aria-hidden="true">
		<span v-for="(drop, i) in drops" :key="i" class="drop" :style="{
			left: drop.left + '%',
			animationDelay: drop.delay + 's',
			animationDuration: drop.duration + 's',
			opacity: drop.opacity
		}"></span>
	</div>
</template>

<style scoped>
/* A layer covering the screen that does not block clicks. */
.rain {
	position: fixed;
	inset: 0;
	pointer-events: none;
	/* clicks go through to the page underneath */
	overflow: hidden;
	z-index: 50;
	/* raise this if modals or menus appear behind the rain */
}

/* One raindrop: a thin vertical line. */
.drop {
	position: absolute;
	top: -20px;
	width: 4px;
	height: 20px;
	background: linear-gradient(to bottom, transparent, #8ecbff);
	animation-name: fall;
	animation-timing-function: linear;
	animation-iteration-count: infinite;
}

/* Move from above the screen to below it. */
@keyframes fall {
	to {
		transform: translateY(110vh);
	}
}

/* Respect users who ask their device to reduce motion. */
@media (prefers-reduced-motion: reduce) {
	.rain {
		display: none;
	}
}
</style>