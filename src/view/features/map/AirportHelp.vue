<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { airportPlan } from '../../model/services/airport.js'
import { catalog } from '../../model/services/catalog.js'
import { tick } from '../../model/services/clock.js'
import { formatTime } from '../../model/services/hours.js'

/**
 * "I need to get to the airport" dialog.
 *
 * Shows the two realistic options from wherever the traveller is (MRT and a
 * Grab/taxi), which one is quickest, whether it beats their airport time, and the
 * practical steps: which station/lines, or how to book and where to meet the car.
 */
const props = defineProps({
  mission: { type: Object, default: null },
  position: { type: Object, default: null }
})

defineEmits(['close'])

const plan = computed(() =>
  airportPlan({
    from: props.position,
    mission: props.mission,
    nowMs: tick.value, // updates every second, so the countdown and advice stay live
    places: catalog.value
  })
)

const urgent = computed(() => plan.value.minutesLeft != null && plan.value.minutesLeft <= 45)

/** "9 h 33 min" reads better than "573 min" on a small card. */
function remainingLabel(minutes) {
  const total = Math.abs(minutes)
  if (total < 90) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

// Only surfaced when the options do not beat the airport time. The normal case
// just shows the two choices and their durations, without a "fastest" verdict.
const warning = computed(() => {
  const p = plan.value
  if (!p.ok || p.atAirport || p.onTime !== false) return null
  if (p.minutesLeft != null && p.minutesLeft <= 0) {
    return 'You are past your airport time. Go straight to your airline counter.'
  }
  return `You'd arrive after ${formatTime(p.deadlineMs)}. Leave now and head straight to the counter.`
})

const transitDirections = computed(() => mapsUrl('transit'))
const drivingDirections = computed(() => mapsUrl('driving'))

function mapsUrl(mode) {
  const from = props.position
  const to = plan.value.destination
  if (!from || !to) return '#'
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=${mode}`
}

const copied = ref(false)
let copiedTimer = 0

async function copyDestination() {
  try {
    await navigator.clipboard.writeText(plan.value.destination.label)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Clipboard can be blocked; the written destination is still visible.
  }
}

onBeforeUnmount(() => clearTimeout(copiedTimer))
</script>

<template>
  <div class="airport-overlay" @click.self="$emit('close')">
    <div class="airport-card" role="dialog" aria-modal="true" aria-label="Get to the airport">
      <button type="button" class="airport-close" aria-label="Close" @click="$emit('close')">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>

      <header class="airport-head">
        <span class="airport-icon"><i class="bi bi-airplane-fill" aria-hidden="true"></i></span>
        <div>
          <div class="airport-eyebrow">Need to leave now?</div>
          <h2 v-if="plan.atAirport">You're at the airport</h2>
          <h2 v-else>Get to {{ plan.destination?.label || 'the airport' }}</h2>
        </div>
      </header>

      <template v-if="plan.ok">
        <div class="airport-deadline" :class="{ urgent }">
          <template v-if="plan.deadlineMs">
            Be at the airport by <b>{{ formatTime(plan.deadlineMs) }}</b>
            <span v-if="plan.minutesLeft != null">
              ·
              {{ plan.minutesLeft >= 0
                ? `${remainingLabel(plan.minutesLeft)} left`
                : `${remainingLabel(plan.minutesLeft)} past` }}
            </span>
          </template>
          <template v-else>
            No flight time set — plan your layover for a deadline check.
          </template>
        </div>

        <p v-if="plan.atAirport" class="airport-summary" :class="{ late: plan.onTime === false }">
          {{ plan.summary }}
        </p>
        <p v-else-if="warning" class="airport-warning">{{ warning }}</p>

        <template v-if="!plan.atAirport">
          <!-- MRT -->
          <section class="airport-option" :class="{ off: plan.mrt && !plan.mrt.available }">
            <header>
              <span class="airport-mode"><i class="bi bi-train-front-fill" aria-hidden="true"></i> MRT</span>
              <span v-if="plan.mrt" class="airport-time">{{ plan.mrt.minutes }} min</span>
            </header>

            <template v-if="plan.mrt">
              <p class="airport-hint">
                Walk {{ plan.mrt.walkToStationMin }} min to <b>{{ plan.mrt.station }}</b>.
              </p>
              <ol class="airport-legs">
                <li v-for="(leg, index) in plan.mrt.legs" :key="index">
                  <b>{{ leg.line }}</b> {{ leg.from }} → {{ leg.to }}
                </li>
              </ol>
              <p class="airport-hint">Follow the signs to {{ plan.destination.label }}.</p>
              <p v-if="plan.mrt.note" class="airport-hint warn">{{ plan.mrt.note }}</p>
              <div class="airport-actions">
                <a class="btn btn-soft btn-sm" :href="transitDirections" target="_blank" rel="noopener">
                  <i class="bi bi-sign-turn-right" aria-hidden="true"></i> Transit directions
                </a>
              </div>
            </template>
            <p v-else class="airport-hint">No MRT route from here.</p>
          </section>

          <!-- Grab / taxi -->
          <section class="airport-option">
            <header>
              <span class="airport-mode"><i class="bi bi-taxi-front-fill" aria-hidden="true"></i> Grab / taxi</span>
              <span class="airport-time">~{{ plan.taxi.effectiveMinutes }} min</span>
            </header>

            <p class="airport-hint">
              Book to <b>{{ plan.destination.label }}</b> · about {{ plan.taxi.km }} km.
            </p>
            <p class="airport-hint"><b>Pick-up:</b> {{ plan.pickup.hint }}</p>

            <div class="airport-actions">
              <a class="btn btn-warning btn-sm" href="https://www.grab.com/sg/" target="_blank" rel="noopener">
                <i class="bi bi-phone" aria-hidden="true"></i> Open Grab
              </a>
              <button type="button" class="btn btn-soft btn-sm" @click="copyDestination">
                <i class="bi" :class="copied ? 'bi-check2' : 'bi-clipboard'" aria-hidden="true"></i>
                {{ copied ? 'Copied' : 'Copy destination' }}
              </button>
              <a class="btn btn-soft btn-sm" :href="drivingDirections" target="_blank" rel="noopener">
                <i class="bi bi-map" aria-hidden="true"></i> Driving directions
              </a>
            </div>
          </section>

          <p class="airport-foot">Times are estimates. Confirm the pick-up point in Grab before booking.</p>
        </template>
      </template>

      <p v-else class="airport-summary">{{ plan.reason }}</p>
    </div>
  </div>
</template>

<style scoped>
.airport-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 14px;
  background: rgba(17, 17, 17, 0.62);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.airport-card {
  position: relative;
  width: min(430px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--zt-black);
  color: var(--zt-yellow-pale);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  border-radius: 20px;
  box-shadow: var(--zt-shadow);
  padding: 16px;
}

.airport-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid rgba(255, 244, 194, 0.3);
  background: transparent;
  color: var(--zt-yellow-pale);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.airport-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 30px;
  margin-bottom: 12px;
}

.airport-icon {
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--zt-yellow);
  color: #111;
  font-size: 1.25rem;
}

.airport-eyebrow {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--zt-yellow);
}

.airport-head h2 {
  font-size: 1.22rem;
  margin: 2px 0 0;
  line-height: 1.2;
}

.airport-deadline {
  margin: 10px 0;
  padding: 8px 10px;
  border-radius: 12px;
  border: 2px solid rgba(255, 204, 0, 0.4);
  background: rgba(255, 204, 0, 0.12);
  font-size: 0.8rem;
  font-weight: 600;
}

.airport-deadline.urgent {
  border-color: var(--zt-orange);
  background: rgba(255, 77, 0, 0.14);
  color: #ffb27a;
}

.airport-summary {
  margin: 8px 0 10px;
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.35;
}

.airport-summary.late {
  color: #ff9b8f;
}

.airport-warning {
  margin: 8px 0 12px;
  padding: 8px 10px;
  border: 2px solid var(--zt-orange);
  border-radius: 12px;
  background: rgba(255, 77, 0, 0.14);
  color: #ffb27a;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.35;
}

.airport-option {
  margin-bottom: 12px;
  padding: 12px;
  border: 2px solid rgba(255, 244, 194, 0.25);
  border-radius: 14px;
}

.airport-option.off {
  opacity: 0.65;
}

.airport-option header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.airport-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  font-weight: 800;
}

.airport-time {
  margin-left: auto;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--zt-yellow);
}

.airport-hint {
  margin: 7px 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: rgba(255, 244, 194, 0.85);
}

.airport-hint.warn {
  color: #ffb27a;
}

.airport-legs {
  margin: 7px 0 7px 18px;
  padding: 0;
  font-size: 0.78rem;
  line-height: 1.45;
}

.airport-legs li {
  margin-bottom: 2px;
}

.airport-legs b {
  color: var(--zt-yellow);
}

.airport-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.airport-foot {
  margin: 6px 0 0;
  font-size: 0.66rem;
  line-height: 1.4;
  color: rgba(255, 244, 194, 0.55);
}
</style>
