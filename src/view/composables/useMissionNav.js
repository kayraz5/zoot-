import { computed } from 'vue'
import { useMissionStore } from '../../model/stores/mission.js'
import { geo, hasFix } from '../../model/services/geo.js'
import { tick } from '../../model/services/clock.js'
import { checkInStatus } from '../../model/services/checkin.js'
import { distanceM, travel } from '../../model/services/travel.js'

/**
 * Everything 3D_Map.vue needs to know about "where the mission currently stands" —
 * pulled out of 3D_Map.vue because these ~10 computed values were a big chunk of why
 * that file's <script setup> kept growing. This only works out state (the active
 * mission, the next stop, distance to it, whether you can stamp, etc.) — it never
 * touches the MapLibre `map` instance, so actually drawing the map stays in
 * 3D_Map.vue, which calls this once and uses the values it needs.
 */
export function useMissionNav() {
  const store = useMissionStore()

  const HOME_RADIUS_M = 300 // "back at the airport/hotel" counts within this distance
  const modeIcon = { walk: 'bi-person-walking', mrt: 'bi-train-front-fill', taxi: 'bi-taxi-front-fill' }

  const demo = computed(() => geo.fake) // Demo-Walk = fake GPS you move with WASD / taps
  const m = computed(() => store.mission)
  const next = computed(() => store.nextLeg)
  const here = computed(() => (hasFix() ? { lat: geo.lat, lng: geo.lng } : null))
  const opts = computed(() => ({ maxWalk: m.value?.prefs?.maxWalk, style: m.value?.style }))

  const liveTravel = computed(() => (next.value && here.value ? travel(here.value, next.value, opts.value) : null))
  const distance = computed(() => (next.value && here.value ? distanceM(here.value, next.value) : null))
  const stopNumber = computed(() => {
    const visits = store.visitLegs
    return next.value?.kind === 'visit' ? `${visits.indexOf(next.value) + 1}/${visits.length}` : ''
  })

  /** Can you stamp right now? Visits use the real check-in rules; the trip home uses a wider radius. */
  const check = computed(() => {
    tick.value
    const n = next.value
    if (!n) return null
    if (n.kind === 'return') {
      if (!here.value) return { ok: false, message: 'Waiting for GPS…' }
      const d = distanceM(here.value, n)
      return d <= HOME_RADIUS_M
        ? { ok: true, message: `You're back at ${n.name}. Check in to finish the quest.` }
        : { ok: false, message: `${formatDist(d)} from ${n.name}. Get within ${HOME_RADIUS_M} m to finish.` }
    }
    return checkInStatus({ place: n, position: here.value ? { ...here.value, accuracy: geo.accuracy } : null, fake: geo.fake })
  })

  /** Minutes you'd arrive after the planned time if you set off now (negative = early). */
  const lateBy = computed(() => {
    if (!next.value || !liveTravel.value) return null
    const eta = tick.value + liveTravel.value.minutes * 60000
    return Math.round((eta - Date.parse(next.value.arrive_iso)) / 60000)
  })

  /** The next instruction: a walking/MRT/taxi hint. No turn-by-turn text — fetchRoute() (OpenRouteService) only gives us the line, not steps. */
  const guidance = computed(() => {
    const t = liveTravel.value
    if (!t || !here.value) return null
    if (t.mode !== 'walk') return { icon: modeIcon[t.mode], text: t.detail }
    if (distance.value < 40) return { icon: 'bi-flag-fill', text: "You're there. Look around for the spot." }
    return { icon: 'bi-person-walking', text: `Walk ${formatDist(distance.value)} to the stop` }
  })

  const countdown = computed(() => {
    if (!store.mustReturnMs) return null
    const s = Math.max(0, Math.floor((store.mustReturnMs - tick.value) / 1000))
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  })
  const leaveBy = computed(() => {
    tick.value
    return m.value && next.value ? store.leaveBy()?.ms ?? null : null
  })

  // Time-remaining badge color: two named booleans instead of one ternary-chain string,
  // so the thresholds are easy to see/tweak wherever this gets used.
  const minutesToDeadline = computed(() => (store.mustReturnMs - tick.value) / 60000)
  const isTimeCritical = computed(() => minutesToDeadline.value < 45) // under 45 min left -> red
  const isTimeWarning = computed(() => minutesToDeadline.value < 90 && !isTimeCritical.value) // under 90 min left (not critical yet) -> amber

  function formatDist(meters) {
    if (meters == null) return ''
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`
  }

  return {
    HOME_RADIUS_M, modeIcon,
    demo, m, next, here, opts,
    liveTravel, distance, stopNumber, check, lateBy, guidance,
    countdown, leaveBy, minutesToDeadline, isTimeCritical, isTimeWarning,
    formatDist
  }
}
