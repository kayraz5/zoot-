<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '../../model/stores/ui.js'
import { tick } from '../../model/services/clock.js'

// Draws falling raindrops over the whole screen when it is raining.

const ONE_HOUR_MS = 60 * 60 * 1000;
const RAIN_THRESHOLD = 60; // show rain when the chance is above this (%)
const DROP_COUNT = 100; // how many raindrops to draw

const ui = useUiStore();

// The pages where rain should appear (route names from the router file).
const RAIN_PAGES = ['map', '3d-map']

const route = useRoute();
const onRainPage = computed(() => RAIN_PAGES.includes(route.name));

// Rain chance for the current hour (same idea as WeatherChip.vue).
const rainChance = computed(() => {
	if (ui.forceRain) return 90;

	const hours = ui.weather?.hours;
	if (!hours) return 0;

	const hour = hours.find((h) => {
		return tick.value >= h.ms && tick.value < h.ms + ONE_HOUR_MS;
	});
	return hour ? hour.prob : 0;
});

const isRaining = computed(() => onRainPage.value && rainChance.value > RAIN_THRESHOLD);

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