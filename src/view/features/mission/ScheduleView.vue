<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMissionStore } from '../../../model/stores/mission.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { loadCatalog } from '../../../model/services/catalog.js'
import { formatDuration, formatTime } from '../../../model/services/hours.js'

/**
 * Simple timeline editor: one histogram of the day, plus a plain list of stops.
 *
 * Every stop is a block whose width is its stay length. Drag the right edge of a
 * block to make that stay longer or shorter; the rest of the plan shifts and the
 * spare time at the end of the bar absorbs the change. Travel between stops is
 * shown as a hatched gap and is not editable.
 *
 * All edits still go through the mission store, so the plan re-times and refuses
 * anything that would miss the airport deadline.
 */
const route = useRoute()
const router = useRouter()
const store = useMissionStore()
const ui = useUiStore()

const barEl = ref(null)
const drag = ref(null)
const selectedId = ref(null)
const busy = ref(false)

const mission = computed(() => store.mission)
const returnLeg = computed(() => store.returnLeg)

const departMs = computed(() =>
  mission.value
    ? Date.parse(mission.value.start_iso) + mission.value.buffers.exit_min * 60000
    : null
)
const arriveByMs = computed(() =>
  returnLeg.value ? Date.parse(returnLeg.value.arrive_by) : null
)
const totalMin = computed(() =>
  arriveByMs.value && departMs.value
    ? Math.max(1, Math.round((arriveByMs.value - departMs.value) / 60000))
    : 1
)
const bufferMin = computed(() =>
  returnLeg.value
    ? Math.max(0, Math.round((arriveByMs.value - Date.parse(returnLeg.value.arrive_iso)) / 60000))
    : 0
)
// Spare time updates live while a block is being dragged.
const liveBuffer = computed(() => Math.max(0, bufferMin.value - (drag.value?.deltaMin || 0)))
const bufferTone = computed(() =>
  liveBuffer.value < 45 ? 'danger' : liveBuffer.value < 90 ? 'warn' : 'ok'
)

/** One segment per stretch of time, in order: travel, stay, …, return travel, spare. */
const segments = computed(() => {
  if (!mission.value || !returnLeg.value) return []

  const out = []
  let cursor = departMs.value
  let stopNo = 0

  for (const leg of mission.value.legs) {
    const arrive = Date.parse(leg.arrive_iso)
    const depart = Date.parse(leg.depart_iso)
    const travel = Math.max(0, Math.round((arrive - cursor) / 60000))

    if (travel > 0) out.push({ key: `travel-${leg.seq}`, kind: 'travel', minutes: travel, leg })
    if (leg.kind === 'visit') {
      stopNo += 1
      const stay = Math.max(0, Math.round((depart - arrive) / 60000))
      if (stay > 0) out.push({ key: `stay-${leg.seq}`, kind: 'stay', minutes: stay, leg, stopNo })
      cursor = depart
    } else {
      cursor = arrive
    }
  }

  const spare = Math.max(0, Math.round((arriveByMs.value - cursor) / 60000))
  if (spare > 0) out.push({ key: 'buffer', kind: 'buffer', minutes: spare })
  return out
})

/** Segments with the in-progress drag applied, without saving anything yet. */
const shownSegments = computed(() => {
  const base = segments.value
  const active = drag.value
  if (!active || !active.deltaMin) return base

  let out = base.map((segment) => {
    if (segment.key === active.key) {
      return { ...segment, minutes: Math.max(1, segment.minutes + active.deltaMin) }
    }
    if (segment.kind === 'buffer') {
      return { ...segment, minutes: Math.max(0, segment.minutes - active.deltaMin) }
    }
    return segment
  })

  if (active.deltaMin < 0 && !out.some((segment) => segment.kind === 'buffer')) {
    out = [...out, { key: 'buffer', kind: 'buffer', minutes: -active.deltaMin }]
  }
  return out.filter((segment) => segment.minutes > 0)
})

const barTotal = computed(() =>
  Math.max(1, shownSegments.value.reduce((sum, segment) => sum + segment.minutes, 0))
)
const stopRows = computed(() => segments.value.filter((segment) => segment.kind === 'stay'))
const hasFixed = computed(
  () => mission.value?.legs?.some((leg) => leg.fixed && leg.kind === 'visit') || false
)

function editable(leg) {
  return leg.status === 'pending' && !leg.fixed
}

function tone(leg) {
  if (leg.fixed) return 'fixed'
  if (leg.status === 'stamped') return 'stamped'
  if (leg.status === 'skipped') return 'skipped'
  return 'stay'
}

function segmentClass(segment) {
  if (segment.kind === 'travel') return 'travel'
  if (segment.kind === 'buffer') return 'buffer'
  return tone(segment.leg)
}

function segmentWidth(segment) {
  return `${(segment.minutes / barTotal.value) * 100}%`
}

function shownStay(segment) {
  const active = drag.value
  if (active && active.key === segment.key) {
    return Math.max(1, active.baseStay + active.deltaMin)
  }
  return segment.leg.stay_min
}

/** A short label for the swatch: stop number in the bar, status in the list. */
function rowLabel(segment) {
  if (segment.leg.status === 'stamped') return '✓'
  if (segment.leg.status === 'skipped') return '–'
  return segment.stopNo
}

async function run(action) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch (err) {
    ui.toast(err.message, 'danger')
  } finally {
    busy.value = false
  }
}

function nudge(leg, delta) {
  run(() => store.changeStay(leg, delta))
}

// ── Drag a stay's right edge ───────────────────────────────────────────────

function startDrag(event, segment) {
  if (busy.value || !editable(segment.leg)) return
  event.preventDefault()
  selectedId.value = segment.leg.place_id

  drag.value = {
    key: segment.key,
    leg: segment.leg,
    pointerId: event.pointerId,
    startX: event.clientX,
    baseStay: segment.leg.stay_min,
    maxDelta: bufferMin.value,
    deltaMin: 0
  }

  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', cancelDrag)
}

function onDragMove(event) {
  const active = drag.value
  if (!active || event.pointerId !== active.pointerId) return

  const width = barEl.value?.getBoundingClientRect().width || 1
  const raw = ((event.clientX - active.startX) / width) * totalMin.value
  const minDelta = 10 - active.baseStay
  const maxDelta = Math.max(0, active.maxDelta)
  active.deltaMin = Math.max(minDelta, Math.min(maxDelta, Math.round(raw / 5) * 5))
}

async function endDrag(event) {
  const active = drag.value
  if (!active || (event && event.pointerId !== active.pointerId)) return

  removeDragListeners()
  drag.value = null

  if (!active.deltaMin) return

  // Commit once, on release; the store re-times the rest of the plan.
  busy.value = true
  try {
    await store.changeStay(active.leg, active.deltaMin)
  } catch (err) {
    ui.toast(err.message, 'danger')
  } finally {
    busy.value = false
  }
}

function cancelDrag() {
  removeDragListeners()
  drag.value = null
}

function removeDragListeners() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', cancelDrag)
}

onBeforeUnmount(() => {
  removeDragListeners()
  drag.value = null
})

async function load() {
  await loadCatalog()
  if (route.params.id) await store.load(route.params.id)
  else await store.loadActive()
}

onMounted(load)
watch(() => route.params.id, load)

function back() {
  router.push(mission.value ? `/mission/${mission.value.id}` : '/mission')
}
</script>

<template>
  <main class="zt-page schedule-page">
    <header class="sched-head">
      <button type="button" class="btn btn-soft btn-sm back" aria-label="Back to mission" @click="back">
        <i class="bi bi-arrow-left"></i>
      </button>
      <div>
        <div class="tiny eyebrow">Edit schedule</div>
        <h1 class="sched-title">{{ mission?.title || 'Timeline' }}</h1>
      </div>
    </header>

    <template v-if="mission && returnLeg">
      <section class="zt-card sched-card">
        <div class="eyebrow">Spare time before the airport</div>
        <div class="big" :class="bufferTone">{{ formatDuration(liveBuffer) }}</div>
        <div class="sub">
          <span>Back by <b class="mono">{{ formatTime(arriveByMs) }}</b></span>
          <span>Flight <b class="mono">{{ formatTime(mission.must_return_iso) }}</b></span>
        </div>

        <div class="timeline">
          <div ref="barEl" class="bar" role="group" aria-label="Schedule blocks by stay length">
            <div
              v-for="segment in shownSegments"
              :key="segment.key"
              class="seg"
              :class="[segmentClass(segment), { selected: segment.kind === 'stay' && selectedId === segment.leg?.place_id }]"
              :style="{ width: segmentWidth(segment) }"
            >
              <span v-if="segment.kind === 'stay' && segment.minutes >= 18" class="seg-no">{{ segment.stopNo }}</span>
              <button
                v-if="segment.kind === 'stay' && editable(segment.leg)"
                type="button"
                class="handle"
                role="slider"
                :aria-label="`${segment.leg.name} stay length`"
                :title="`Drag to change how long you stay at ${segment.leg.name}`"
                :aria-valuemin="10"
                :aria-valuemax="240"
                :aria-valuenow="shownStay(segment)"
                :aria-valuetext="`${shownStay(segment)} minutes`"
                :disabled="busy"
                @pointerdown="startDrag($event, segment)"
                @keydown.left.prevent="nudge(segment.leg, -5)"
                @keydown.right.prevent="nudge(segment.leg, 5)"
              ></button>
            </div>
          </div>
          <div class="ends">
            <span class="mono">{{ formatTime(departMs) }} leave</span>
            <span class="mono">{{ formatTime(arriveByMs) }} back</span>
          </div>
        </div>

        <p class="legend">
          <span><i class="dot stay"></i> Stop</span>
          <span v-if="hasFixed"><i class="dot fixed"></i> Fixed</span>
          <span><i class="dot travel"></i> Travel</span>
          <span><i class="dot buffer"></i> Spare</span>
        </p>

        <p class="sched-help">
          Drag the right edge of a stop to make it longer or shorter. The spare time at
          the end absorbs the change.
        </p>
      </section>

      <section class="zt-card stops-card">
        <div class="list-head">
          <span>Stops</span>
          <span class="tiny muted">Drag the bar edge to edit</span>
        </div>
        <ul class="stops">
          <li
            v-for="segment in stopRows"
            :key="segment.key"
            :class="{ selected: selectedId === segment.leg.place_id }"
            @click="selectedId = segment.leg.place_id"
          >
            <span class="swatch" :class="tone(segment.leg)">{{ rowLabel(segment) }}</span>
            <div class="stop-main">
              <div class="stop-name">{{ segment.leg.name }}</div>
              <div class="stop-sub">
                {{ formatTime(segment.leg.arrive_iso) }}–{{ formatTime(segment.leg.depart_iso) }}
                <span v-if="segment.leg.fixed"> · Fixed with {{ segment.leg.with_host }}</span>
                <span v-else-if="segment.leg.status === 'stamped'"> · Stamped</span>
                <span v-else-if="segment.leg.status === 'skipped'"> · Skipped</span>
              </div>
            </div>
            <span class="stop-dur mono">{{ shownStay(segment) }} min</span>
          </li>
        </ul>
      </section>

      <div class="sched-foot">
        <span class="tiny muted save-note"><i class="bi bi-check2-circle"></i> Saved automatically</span>
        <button type="button" class="btn btn-pop flex-grow-1" @click="back">Done</button>
      </div>
    </template>

    <section v-else-if="mission" class="zt-card p-4 text-center">
      <i class="bi bi-signpost-split display-5 text-muted"></i>
      <h2 class="h5 mt-2">This plan has no return leg</h2>
      <p class="text-muted small">Rebuild it from the plan screen to edit the schedule.</p>
      <RouterLink to="/plan" class="btn btn-primary">Plan a layover</RouterLink>
    </section>

    <section v-else class="zt-card p-4 text-center">
      <i class="bi bi-calendar-x display-5 text-muted"></i>
      <h2 class="h5 mt-2">No mission to edit</h2>
      <p class="text-muted small">Build a layover plan first, then come back to adjust the timing.</p>
      <RouterLink to="/plan" class="btn btn-primary">Plan a layover</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.schedule-page {
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

.sched-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.sched-head .back {
  flex: none;
}

.sched-title {
  margin: 1px 0 0;
  font-size: clamp(1.35rem, 5.5vw, 1.9rem);
  line-height: 1.1;
}

.eyebrow {
  color: var(--zt-muted);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sched-card {
  padding: 16px;
  margin-bottom: 14px;
}

.big {
  margin: 2px 0 2px;
  font-family: var(--zt-font-head);
  font-size: clamp(2.2rem, 9vw, 2.9rem);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: -0.01em;
}

.big.ok {
  color: var(--zt-ink);
}

.big.warn {
  color: var(--zt-orange);
}

.big.danger {
  color: var(--zt-pink);
}

[data-bs-theme='dark'] .big.ok {
  color: var(--zt-yellow);
}

.sub {
  display: flex;
  flex-wrap: wrap;
  column-gap: 14px;
  row-gap: 2px;
  font-size: 0.86rem;
}

.sub b {
  color: var(--zt-ink);
  font-weight: 800;
}

.timeline {
  margin-top: 18px;
}

.bar {
  display: flex;
  height: 46px;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
}

.seg {
  position: relative;
  flex: 0 0 auto;
  min-width: 2px;
  height: 100%;
}

.seg + .seg {
  box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.18);
}

.seg.stay {
  background: var(--zt-yellow);
}

.seg.fixed {
  background: var(--zt-pink);
}

.seg.stamped {
  background: #111;
}

.seg.skipped {
  background: var(--zt-soft-line);
  opacity: 0.6;
}

.seg.travel {
  background: repeating-linear-gradient(-45deg, #b9b3a1 0 4px, #6a6a6a 4px 7px);
}

.seg.buffer {
  background: repeating-linear-gradient(-45deg, #cfe8c6 0 4px, #a9d79a 4px 8px);
}

[data-bs-theme='dark'] .seg.buffer {
  background: repeating-linear-gradient(-45deg, #2f5a3c 0 4px, #244a31 4px 8px);
}

.seg.selected {
  box-shadow: inset 0 0 0 3px rgba(17, 17, 17, 0.55);
}

.seg-no {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #111;
  font-family: var(--zt-font-head);
  font-size: 0.8rem;
  font-weight: 700;
  pointer-events: none;
}

.seg.stamped .seg-no {
  color: var(--zt-yellow);
}

.handle {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  width: 24px;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: ew-resize;
  touch-action: none;
}

.handle::before {
  content: '';
  position: absolute;
  top: 9px;
  bottom: 9px;
  right: 7px;
  width: 2px;
  border-radius: 2px;
  background: rgba(17, 17, 17, 0.45);
  box-shadow: 3px 0 0 rgba(17, 17, 17, 0.2);
}

.handle:focus-visible {
  outline: 2px solid var(--zt-ink);
  outline-offset: -2px;
}

.ends {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: var(--zt-muted);
  font-size: 0.72rem;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 12px 0 0;
  color: var(--zt-muted);
  font-size: 0.7rem;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.dot.stay {
  background: var(--zt-yellow);
}

.dot.fixed {
  background: var(--zt-pink);
}

.dot.travel {
  background: #8d8878;
}

.dot.buffer {
  background: #a9d79a;
}

.sched-help {
  margin: 10px 0 0;
  color: var(--zt-muted);
  font-size: 0.74rem;
  line-height: 1.4;
}

.stops-card {
  padding: 12px;
}

.list-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 0 4px 6px;
  font-size: 0.8rem;
  font-weight: 800;
}

.stops {
  margin: 0;
  padding: 0;
  list-style: none;
}

.stops li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 9px 8px;
  border-radius: 10px;
  cursor: pointer;
}

.stops li.selected {
  background: var(--zt-yellow-pale);
  color: #111;
}

[data-bs-theme='dark'] .stops li.selected {
  background: rgba(255, 204, 0, 0.12);
  color: var(--zt-yellow);
}

.swatch {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #111;
  font-family: var(--zt-font-head);
  font-size: 0.68rem;
  font-weight: 700;
}

.swatch.stay {
  background: var(--zt-yellow);
}

.swatch.fixed {
  background: var(--zt-pink);
}

.swatch.stamped {
  background: #111;
  color: var(--zt-yellow);
}

.swatch.skipped {
  background: var(--zt-soft-line);
  color: var(--zt-muted);
}

.stop-main {
  min-width: 0;
}

.stop-name {
  overflow: hidden;
  font-size: 0.88rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stop-sub {
  color: var(--zt-muted);
  font-size: 0.7rem;
  line-height: 1.3;
}

.stops li.selected .stop-sub {
  color: inherit;
  opacity: 0.78;
}

.stop-dur {
  font-size: 0.8rem;
  font-weight: 800;
}

.muted {
  color: var(--zt-muted);
}

.sched-foot {
  position: fixed;
  left: 50%;
  bottom: max(10px, env(safe-area-inset-bottom));
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(560px, calc(100% - 24px));
  padding: 10px;
  border: 2px solid var(--zt-line);
  border-radius: 18px;
  background: var(--zt-bg);
  box-shadow: var(--zt-shadow-sm);
  transform: translateX(-50%);
}

.save-note {
  white-space: nowrap;
}

@media (max-width: 380px) {
  .save-note {
    display: none;
  }

  .bar {
    height: 40px;
  }
}
</style>
