<script setup>
import { computed } from 'vue'
import { tick } from '../lib/clock.js'
import { fmtTime } from '../lib/hours.js'

/** Always-visible countdown, styled like a departure board. Yellow under 90 min, red under 45 (IA §7.1). */
const props = defineProps({
  mustReturnMs: { type: Number, required: true },
  leaveByMs: { type: Number, default: null },
  label: { type: String, default: 'Time to gate' }
})
const remaining = computed(() => props.mustReturnMs - tick.value)
const minutes = computed(() => remaining.value / 60000)
const level = computed(() => (minutes.value < 45 ? 'red' : minutes.value < 90 ? 'amber' : 'ok'))
const text = computed(() => {
  const s = Math.max(0, Math.floor(remaining.value / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})
const leaveSoon = computed(() => props.leaveByMs && props.leaveByMs - tick.value < 15 * 60000)
</script>

<template>
  <div class="ttg" :class="level" role="timer" :aria-label="`${label} ${text}`">
    <div class="lbl"><i class="bi bi-airplane-fill"></i> {{ label }}</div>
    <div class="val mono">{{ text }}</div>
    <div v-if="leaveByMs" class="leave" :class="{ soon: leaveSoon }">Head back by {{ fmtTime(leaveByMs) }}</div>
  </div>
</template>

<style scoped>
.ttg { border-radius: 16px; padding: 6px 12px 7px; min-width: 132px; background: #111; color: var(--zt-yellow); border: var(--zt-bw) solid #111; box-shadow: 4px 4px 0 var(--zt-yellow); }
[data-bs-theme='dark'] .ttg { border-color: var(--zt-yellow); box-shadow: 4px 4px 0 var(--zt-yellow); }
.ttg.amber { background: var(--zt-yellow); color: #111; box-shadow: 4px 4px 0 #111; }
.ttg.red { background: var(--zt-orange); color: #fff; border-color: #111; box-shadow: 4px 4px 0 #111; animation: ttg-alarm 1.2s infinite; }
@keyframes ttg-alarm { 0% { box-shadow: 4px 4px 0 #111, 0 0 0 0 rgba(255, 77, 0, 0.7); } 70%, 100% { box-shadow: 4px 4px 0 #111, 0 0 0 16px rgba(255, 77, 0, 0); } }
.lbl { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
.val { font-family: var(--zt-font-display); font-size: 2rem; line-height: 0.95; letter-spacing: 0.04em; }
.leave { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.95; }
.leave.soon { background: var(--zt-pink); color: #111; border-radius: 6px; padding: 0 5px; display: inline-block; }
</style>
