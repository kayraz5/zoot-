<script setup>
import { useUserStore } from '../../../model/stores/user.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { STYLES } from '../../../model/data/origins.js'
import { useStyleId } from './planUi.js'

/** "How do you travel?": the four travel styles; the choice is saved on the profile. */
defineProps({ wide: { type: Boolean, default: false } })
const user = useUserStore()
const ui = useUiStore()

const SUB = { budget: 'Free & cheap', adventurous: 'More stops', party: 'Late & lively', conservative: 'Few stops, indoors' }
const QUIZ = { path: '/onboard', query: { next: '/plan' } }
const styleId = useStyleId()

async function choose(id) {
	try {
		await user.updateProfile({ style: id })
	} catch (err) {
		ui.toast(err.message, 'danger')
	}
}
</script>

<template>
	<section :class="{ 'zt-card p-3': wide }">
		<div class="d-flex justify-content-between align-items-baseline">
			<component :is="wide ? 'div' : 'h2'" :class="wide ? 'plan-label' : 'plan-step-h'">How do you travel?</component>
			<RouterLink v-if="wide" class="tiny fw-800" :to="QUIZ">Retake the quiz</RouterLink>
		</div>
		<div class="style-grid mt-2">
			<button v-for="(s, id) in STYLES" :key="id" type="button" class="plan-pick" :class="{ active: styleId === id }" :aria-pressed="styleId === id" @click="choose(id)">
				<i class="bi" :class="s.icon"></i>
				<b>{{ s.label }}</b>
				<span class="tiny sub">{{ SUB[id] }}</span>
				<i v-if="styleId === id" class="bi bi-check-circle-fill plan-check"></i>
			</button>
		</div>
		<RouterLink v-if="!wide" class="tiny fw-800 d-inline-block mt-2" :to="QUIZ">Not you? Retake the quiz</RouterLink>
	</section>
</template>

<style scoped>
.style-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.is-wide .style-grid { grid-template-columns: repeat(4, 1fr); }
b { text-transform: uppercase; font-size: 0.78rem; }
.sub { font-weight: 600; color: inherit; opacity: 0.8; }
</style>
