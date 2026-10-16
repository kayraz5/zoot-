<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import destination from '@turf/destination'
import { point } from '@turf/helpers'
import { geo, setFake, teleport, hasFix } from '../lib/geo.js'
import { skipMinutes, resetClock, clockOffsetMin, tick } from '../lib/clock.js'
import { fmtTime } from '../lib/hours.js'
import { HAS_SUPABASE } from '../lib/config.js'
import { getDb } from '../lib/db/index.js'
import { useMissionStore } from '../stores/mission.js'
import { useUiStore } from '../stores/ui.js'
import { useUserStore } from '../stores/user.js'

/** God mode for demos and grading (stripped from production unless VITE_DEV_PANEL=1). */
const store = useMissionStore()
const ui = useUiStore()
const user = useUserStore()
const router = useRouter()
const groq = ref('checking…')

onMounted(async () => {
  await store.loadActive()
  try {
    const r = await fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place: { name: 'Merlion Park', blurb: 'Test.' } }) })
    groq.value = r.ok ? 'connected' : r.status === 503 ? 'no GROQ_API_KEY (fallback planner in use)' : r.status === 404 ? 'no /api route (static host)' : `error ${r.status}`
  } catch {
    groq.value = 'unreachable'
  }
})

const next = computed(() => store.nextLeg)
const clock = computed(() => (tick.value, fmtTime(tick.value)))

function near(meters) {
  const n = next.value
  if (!n) return
  if (!geo.fake) setFake(true)
  const [lng, lat] = destination(point([n.lng, n.lat]), meters / 1000, 200, { units: 'kilometers' }).geometry.coordinates
  teleport({ lat, lng })
  ui.toast(meters ? `Teleported ${meters} m from ${n.name}` : `Standing at ${n.name}`, 'dark')
}

async function grant() {
  const n = next.value
  if (!n || n.kind !== 'visit') return ui.toast('No stop to grant', 'warning')
  try {
    if (!geo.fake) setFake(true)
    teleport({ lat: n.lat, lng: n.lng })
    await store.stamp(n, { dev: true })
  } catch (err) {
    ui.toast(err.message, 'warning')
  }
}

async function resetLocal() {
  if (!confirm('Delete all Zoot data stored in this browser (guest profile, missions, stamps)?')) return
  const db = await getDb()
  await db.resetAll?.()
  ;['zoot.pendingSlams', 'zoot.seen', 'zoot.activeMission', 'zoot.bookmarks', 'zoot.clockOffset', 'zoot.forceRain', 'zoot.fakeGps', 'zoot.guest'].forEach((k) => localStorage.removeItem(k))
  Object.keys(localStorage).filter((k) => k.startsWith('zoot.summary.')).forEach((k) => localStorage.removeItem(k))
  location.href = '/'
}
</script>

<template>
  <main class="zt-page">
    <h1 style="font-size: 2.4rem"><i class="bi bi-joystick"></i> Dev panel</h1>
    <p class="text-muted small">Demo controls. Everything here is also reachable on the map with the joystick button.</p>

    <section class="zt-card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center">
        <b>Fake GPS</b>
        <div class="form-check form-switch m-0">
          <input id="fake" class="form-check-input" type="checkbox" role="switch" :checked="geo.fake" @change="setFake($event.target.checked, next || store.mission?.origin)" />
        </div>
      </div>
      <p class="tiny text-muted mb-2 mono">{{ hasFix() ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} ±${Math.round(geo.accuracy || 0)} m (${geo.source})` : 'no position' }}</p>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-soft btn-sm" :disabled="!next" @click="near(220)">220 m from next stop</button>
        <button class="btn btn-soft btn-sm" :disabled="!next" @click="near(0)">At next stop</button>
        <button class="btn btn-soft btn-sm" :disabled="!store.mission" @click="setFake(true); teleport(store.mission.origin)">At origin</button>
      </div>
      <div class="d-flex gap-2 align-items-center mt-2 small">
        Walk speed
        <button v-for="s in [1, 6, 20]" :key="s" class="zt-chip py-0 px-2" :class="{ active: geo.speed === s }" @click="geo.speed = s">{{ s }}×</button>
      </div>
      <p class="tiny text-muted mb-0 mt-2">On the map: WASD / arrow keys walk (Shift runs), tapping the ground walks there.</p>
    </section>

    <section class="zt-card p-3 mb-3">
      <b>Clock</b> <span class="mono ms-2">{{ clock }} SGT</span> <span v-if="clockOffsetMin()" class="zt-pill pale ms-1">+{{ clockOffsetMin() }} min</span>
      <div class="d-flex flex-wrap gap-2 mt-2">
        <button class="btn btn-soft btn-sm" @click="skipMinutes(15)">Skip 15 min</button>
        <button class="btn btn-soft btn-sm" @click="skipMinutes(60)">Skip 1 h</button>
        <button class="btn btn-soft btn-sm" @click="resetClock()">Reset clock</button>
      </div>
    </section>

    <section class="zt-card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center">
        <b>Force rain</b>
        <div class="form-check form-switch m-0">
          <input id="rain" class="form-check-input" type="checkbox" role="switch" :checked="ui.forceRain" @change="ui.setForceRain($event.target.checked)" />
        </div>
      </div>
      <p class="tiny text-muted mb-2">Every hour reads 90% rain. Outdoor legs get a warning and the planner goes indoor-only.</p>
      <button class="btn btn-soft btn-sm" :disabled="!store.mission" @click="store.replan('rain')">Run rain rewrite now</button>
    </section>

    <section class="zt-card p-3 mb-3">
      <b>Stamps</b>
      <p class="tiny text-muted mb-2">Next: {{ next ? `${next.seq}. ${next.name}` : '—' }}</p>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-pop btn-sm" :disabled="!next || next.kind !== 'visit'" @click="grant">Grant next stamp</button>
        <button class="btn btn-soft btn-sm" @click="router.push('/passport')">Open passport</button>
      </div>
    </section>

    <section class="zt-card p-3 mb-3 small">
      <b>Environment</b>
      <ul class="mb-0 mt-2">
        <li>Data: {{ user.mode === 'supabase' ? 'Supabase' : 'Guest (localStorage)' }}{{ HAS_SUPABASE ? '' : ' (no Supabase keys)' }}</li>
        <li>Groq: {{ groq }}</li>
        <li>Weather: {{ ui.weather ? 'Open-Meteo OK' : ui.weatherError || 'not loaded' }}</li>
      </ul>
    </section>

    <button class="btn btn-outline-danger btn-sm" @click="resetLocal"><i class="bi bi-trash"></i> Reset local data</button>
  </main>
</template>
