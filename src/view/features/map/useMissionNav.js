import { computed } from 'vue'
import { useMissionStore } from '../../../model/stores/mission.js'
import { geo, hasFix } from '../../../model/services/geo.js'
import { tick } from '../../../model/services/clock.js'
import { checkInStatus } from '../../../model/services/checkin.js'
import { distanceM, travel } from '../../../model/services/travel.js'

/**
 * Mission navigation state shared by the map view and the next-stop card.
 *
 * Everything here is *derived*: it reads the mission store, the GPS service and the
 * clock, and never touches the MapLibre instance. Keeping it separate means the map
 * view can stay focused on drawing and gestures, and the same values can be reused
 * by another screen later.
 *
 * `tick` is a reactive clock; referencing it inside a computed makes that value
 * recompute as time passes even when nothing else changes.
 */
export function useMissionNav() {
  const store = useMissionStore()

  /** "Back at the airport/hotel" counts within this radius. */
  const HOME_RADIUS_M = 300
  const modeIcon = { walk: 'bi-person-walking', mrt: 'bi-train-front-fill', taxi: 'bi-taxi-front-fill' }

  const demo = computed(() => geo.fake) // Demo-Walk = fake GPS moved with WASD / taps
  const mission = computed(() => store.mission)
  const next = computed(() => store.nextLeg)
  const here = computed(() => (hasFix() ? { lat: geo.lat, lng: geo.lng } : null))
  const travelOptions = computed(() => ({ maxWalk: mission.value?.prefs?.maxWalk, style: mission.value?.style }))

  const liveTravel = computed(() =>
    next.value && here.value ? travel(here.value, next.value, travelOptions.value) : null
  )
  const distance = computed(() => (next.value && here.value ? distanceM(here.value, next.value) : null))

  const stopNumber = computed(() => {
    const visits = store.visitLegs
    if (next.value?.kind !== 'visit') return ''
    return `${visits.indexOf(next.value) + 1}/${visits.length}`
  })

  /**
   * Can the traveller stamp right now?
   * Visits use the real geofence rules; the trip home uses the wider home radius.
   */
  const check = computed(() => {
    tick.value // recompute as the clock advances
    const target = next.value
    if (!target) return null

    if (target.kind === 'return') {
      if (!here.value) return { ok: false, message: 'Waiting for GPS…' }
      const meters = distanceM(here.value, target)
      return meters <= HOME_RADIUS_M
        ? { ok: true, message: `You're back at ${target.name}. Check in to finish the quest.` }
        : {
            ok: false,
            code: 'far',
            message: `${formatDistance(meters)} from ${target.name}. Get within ${HOME_RADIUS_M} m to finish.`
          }
    }

    return checkInStatus({
      place: target,
      position: here.value ? { ...here.value, accuracy: geo.accuracy } : null,
      fake: geo.fake
    })
  })

  /** Minutes you would arrive after the planned time if you set off now (negative = early). */
  const lateBy = computed(() => {
    if (!next.value || !liveTravel.value) return null
    const eta = tick.value + liveTravel.value.minutes * 60000
    return Math.round((eta - Date.parse(next.value.arrive_iso)) / 60000)
  })

  /** Next instruction: a walking/MRT/taxi hint (no turn-by-turn steps are available). */
  const guidance = computed(() => {
    const travelInfo = liveTravel.value
    if (!travelInfo || !here.value) return null
    if (travelInfo.mode !== 'walk') return { icon: modeIcon[travelInfo.mode], text: travelInfo.detail }
    if (distance.value < 40) return { icon: 'bi-flag-fill', text: "You're there. Look around for the spot." }
    return { icon: 'bi-person-walking', text: `Walk ${formatDistance(distance.value)} to the stop` }
  })

  const countdown = computed(() => {
    if (!store.mustReturnMs) return null
    const totalSeconds = Math.max(0, Math.floor((store.mustReturnMs - tick.value) / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  })

  const leaveBy = computed(() => {
    tick.value
    return mission.value && next.value ? store.leaveBy()?.ms ?? null : null
  })

  // Two named thresholds rather than one ternary chain, so the badge colours are
  // explicit wherever they are used.
  const minutesToDeadline = computed(() => (store.mustReturnMs - tick.value) / 60000)
  const isTimeCritical = computed(() => minutesToDeadline.value < 45) // under 45 min → red
  const isTimeWarning = computed(() => minutesToDeadline.value < 90 && !isTimeCritical.value) // under 90 → amber

  /** Format metres as "120 m" or "1.2 km". */
  function formatDistance(meters) {
    if (meters == null) return ''
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`
  }

  return {
    HOME_RADIUS_M,
    modeIcon,
    demo,
    mission,
    next,
    here,
    travelOptions,
    liveTravel,
    distance,
    stopNumber,
    check,
    lateBy,
    guidance,
    countdown,
    leaveBy,
    minutesToDeadline,
    isTimeCritical,
    isTimeWarning,
    formatDistance
  }
}
