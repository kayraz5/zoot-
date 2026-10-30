<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { LINES } from '../../../model/data/transitLines.js'
import { getBusArrivals } from '../../../model/services/transitRoute.js'

/**
 * What you see after tapping a station or bus stop on the map.
 * Station: its lines in their colours, and how to pay. Bus stop: every bus that stops
 * here with live arrival times (refreshed every 30 s while open).
 */
const props = defineProps({
  stop: { type: Object, required: true } // tapped feature: { kind: 'station'|'bus', name, … }
})
defineEmits(['close'])

const REFRESH_MS = 30000
const arrivals = ref(null) // null = loading, [] = none, false = couldn't load
let timer = 0

const lines = computed(() => (props.stop.lines || '').split(',').filter(Boolean).map((code) => ({ code, ...LINES[code] })))
const services = computed(() => (props.stop.services || '').split(',').filter(Boolean))

async function loadArrivals() {
  clearTimeout(timer)
  if (props.stop.kind !== 'bus') return
  const result = await getBusArrivals(props.stop.code)
  arrivals.value = result ?? false
  timer = setTimeout(loadArrivals, REFRESH_MS)
}

watch(() => props.stop, () => {
  arrivals.value = null
  loadArrivals()
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const LOAD = { SEA: 'Seats', SDA: 'Standing', LSD: 'Full' }
const when = (m) => (m <= 0 ? 'Arr' : `${m} min`)
</script>

<template>
  <div class="sheet rounded-4" role="dialog" :aria-label="stop.name">
    <button type="button" class="sheet-close" aria-label="Close" @click="$emit('close')"><i class="bi bi-x-lg"></i></button>

    <template v-if="stop.kind === 'station'">
      <div class="eyebrow"><i class="bi bi-train-front-fill"></i> MRT station · {{ stop.codes }}</div>
      <div class="title">{{ stop.name }}</div>
      <div class="chips">
        <span v-for="l in lines" :key="l.code" class="line-chip" :style="{ background: l.hex }">{{ l.code }} · {{ l.colour }} line</span>
      </div>
      <p class="note">Tap a contactless bank card or phone at the gate to enter, and again to leave.</p>
    </template>

    <template v-else>
      <div class="eyebrow"><i class="bi bi-bus-front-fill"></i> Bus stop {{ stop.code }} · {{ stop.road }}</div>
      <div class="title">{{ stop.name }}</div>
      <p v-if="arrivals === null" class="note">Checking live arrivals…</p>
      <p v-else-if="arrivals === false" class="note">Live times aren't available right now. Buses here: {{ services.join(', ') }}</p>
      <p v-else-if="!arrivals.length" class="note">No buses due right now. Most stop running around midnight.</p>
      <ul v-else class="arrivals">
        <li v-for="s in arrivals" :key="s.no">
          <span class="bus-no">{{ s.no }}</span>
          <span class="times">{{ s.mins.length ? s.mins.map(when).join(' · ') : 'Not running' }}</span>
          <span v-if="s.load" class="load" :class="s.load">{{ LOAD[s.load] }}</span>
        </li>
      </ul>
      <p class="note">Board at the front and tap your card. Tap again at the back door when you get off.</p>
    </template>
  </div>
</template>

<style scoped>
.sheet {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: var(--zt-nav-dock);
  width: 90%; max-width: 440px; z-index: 3; padding: 14px 16px;
  background: var(--zt-black); color: var(--zt-yellow-pale);
  border: 3px solid var(--zt-yellow); box-shadow: var(--zt-shadow);
}
.sheet-close {
  position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border: 0; border-radius: 50%;
  background: none; color: var(--zt-yellow-pale); opacity: 0.7;
}
.eyebrow { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; padding-right: 28px; }
.title { font-size: 1.2rem; font-weight: 800; color: var(--zt-yellow); margin: 2px 0 8px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.line-chip { color: #fff; font-weight: 800; font-size: 0.78rem; padding: 3px 9px; border-radius: 999px; border: 2px solid #111; }
.note { font-size: 0.8rem; opacity: 0.8; margin: 8px 0 0; }
.arrivals { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; max-height: 34vh; overflow-y: auto; }
.arrivals li { display: flex; align-items: center; gap: 10px; }
.bus-no { min-width: 48px; text-align: center; font-weight: 900; color: #fff; background: #2b9cff; border: 2px solid #111; border-radius: 8px; padding: 2px 6px; }
.times { font-weight: 700; flex: 1; }
.load { font-size: 0.72rem; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: #5fd38d; color: #111; }
.load.SDA { background: #ffcc00; }
.load.LSD { background: #ff6b6b; }
</style>
