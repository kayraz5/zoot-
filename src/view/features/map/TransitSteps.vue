<script setup>
import { computed, ref } from 'vue'

/**
 * Step-by-step directions inside the next-stop card, for travellers who have never used
 * Singapore's trains or buses: the step you're on, what comes next, every step on tap,
 * and a short "how it works" for first-timers.
 */
const props = defineProps({
  steps: { type: Array, default: () => [] },  // transitSteps(): { icon, colour, badge, title, detail, mode }
  index: { type: Number, default: 0 },        // the step the traveller is on
  busAlt: { type: Object, default: null }     // { service, stop, minutes } when a taxi leg has a bus option
})

const showAll = ref(false)
const showTips = ref(false)
const current = computed(() => props.steps[props.index])
const upNext = computed(() => props.steps[props.index + 1])
const usesTransit = computed(() => props.steps.some((s) => s.mode !== 'walk'))
</script>

<template>
  <div class="transit">
    <template v-if="current">
      <!-- The full list already highlights the current step, so show one or the other. -->
      <div v-if="!showAll" class="step now">
        <span class="badge-mode" :style="{ background: current.colour }">
          <template v-if="current.badge">{{ current.badge }}</template>
          <i v-else class="bi" :class="current.icon" aria-hidden="true"></i>
        </span>
        <div class="min-w-0">
          <div class="step-title">{{ current.title }}</div>
          <div v-if="current.detail" class="step-detail">{{ current.detail }}</div>
        </div>
      </div>
      <div v-if="upNext && !showAll" class="up-next">Then: {{ upNext.title }}</div>

      <ol v-if="showAll" class="all">
        <li v-for="(s, i) in steps" :key="i" class="step" :class="{ done: i < index, now: i === index }">
          <span class="badge-mode sm" :style="{ background: s.colour }">
            <template v-if="s.badge">{{ s.badge }}</template>
            <i v-else class="bi" :class="s.icon" aria-hidden="true"></i>
          </span>
          <div class="min-w-0">
            <div class="step-title">{{ s.title }}</div>
            <div v-if="s.detail" class="step-detail">{{ s.detail }}</div>
          </div>
        </li>
      </ol>

      <div class="links">
        <button type="button" class="link" :aria-expanded="showAll" @click="showAll = !showAll; showTips = false">
          {{ showAll ? 'Hide steps' : `All ${steps.length} steps` }}
        </button>
        <button v-if="usesTransit" type="button" class="link" :aria-expanded="showTips" @click="showTips = !showTips; showAll = false">
          First time on the MRT or bus?
        </button>
      </div>
    </template>

    <div v-else-if="busAlt" class="up-next">
      <i class="bi bi-bus-front-fill"></i> Or take bus {{ busAlt.service }} from {{ busAlt.stop }} · about {{ busAlt.minutes }} min
    </div>

    <ul v-if="showTips" class="tips">
      <li><b>Paying:</b> tap a contactless Visa or Mastercard (or your phone) on the gate or the bus reader. No ticket needed. Use the same card all day.</li>
      <li><b>Tap out too:</b> at the station gate, and on the bus reader at the back door when you get off.</li>
      <li><b>Which platform:</b> follow the line colour, then the sign with the end station ("towards …").</li>
      <li><b>On the bus:</b> board at the front, press the red bell before your stop.</li>
      <li><b>Hours:</b> trains and most buses run about 5:30 am to midnight, every few minutes.</li>
      <li><b>Rules:</b> no eating or drinking on trains or in stations. Fines are real.</li>
    </ul>
  </div>
</template>

<style scoped>
.transit { margin-top: 8px; color: var(--zt-yellow-pale); }
.step { display: flex; gap: 10px; align-items: flex-start; }
.badge-mode {
  flex: none; min-width: 34px; height: 34px; padding: 0 6px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 900; font-size: 0.85rem; border: 2px solid #111;
}
.badge-mode.sm { min-width: 26px; height: 26px; border-radius: 8px; font-size: 0.72rem; }
.min-w-0 { min-width: 0; }
.step-title { font-weight: 800; line-height: 1.25; font-size: clamp(0.82rem, 4cqw, 1.02rem); color: var(--zt-yellow); }
.step-detail { font-size: clamp(0.72rem, 3.5cqw, 0.9rem); opacity: 0.8; line-height: 1.3; margin-top: 1px; }
.up-next { margin-top: 6px; font-size: clamp(0.72rem, 3.5cqw, 0.9rem); opacity: 0.75; }

.all { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 8px; max-height: 32vh; overflow-y: auto; }
.all .step-title { color: var(--zt-yellow-pale); font-size: 0.85rem; }
.all .now .step-title { color: var(--zt-yellow); }
.all .done { opacity: 0.45; }

.links { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
.link {
  padding: 0; border: 0; background: none; color: var(--zt-yellow-pale); opacity: 0.8;
  font-weight: 800; font-size: 0.78rem; text-decoration: underline; text-underline-offset: 3px;
}

.tips {
  margin: 8px 0 0; padding: 10px 12px 10px 26px; border-radius: 12px;
  background: rgba(255, 244, 194, 0.08); font-size: 0.78rem; line-height: 1.4; display: grid; gap: 4px;
}
</style>
