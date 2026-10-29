<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMissionStore } from '../../../model/stores/mission.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { usePartyStore } from '../../../model/stores/party.js'
import { loadCatalog, placeById } from '../../../model/services/catalog.js'
import { formatTime } from '../../../model/services/hours.js'
import { rainLookup } from '../../../model/services/weather.js'
import { RAIN_LIMIT } from '../../../model/services/planner.js'
import { tick } from '../../../model/services/clock.js'
import { STYLES } from '../../../model/data/origins.js'
import TimeToGate from './TimeToGate.vue'
import LayoverCard from './LayoverCard.vue'
import StopGallery from '../../common/StopGallery.vue'
import PlacePicker from './PlacePicker.vue'
import OpenToCompanySheet from '../quests/OpenToCompanySheet.vue'

const route = useRoute()
const router = useRouter()
const store = useMissionStore()
const ui = useUiStore()
const party = usePartyStore()

async function load() {
  await loadCatalog()
  if (route.params.id) await store.load(route.params.id)
  else await store.loadActive()
  if (!ui.weather && store.mission) ui.loadWeather(store.mission.legs[0].lat, store.mission.legs[0].lng)
  // Joined someone's quest? Check the host hasn't closed it or changed my stops.
  if (store.mission?.joined) store.checkJoined()
  focusCurrent()
}
onMounted(load)
watch(() => route.params.id, load)

const m = computed(() => store.mission)

// Completed stops (stamped or skipped) stay out of the way: one summary row, expandable to compact lines.
const showDone = ref(false)
const isDone = (leg) => leg.kind === 'visit' && leg.status !== 'pending'
const doneCount = computed(() => m.value?.legs.filter(isDone).length || 0)

// Opening the page brings the current stop into view, with a short highlight.
const flash = ref(null) // seq of the card being highlighted
async function focusCurrent() {
  await nextTick()
  const next = store.nextLeg
  const el = next && document.getElementById(`leg-${next.seq}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.querySelector('.stop-card')?.focus({ preventScroll: true })
  flash.value = next.seq
  setTimeout(() => { if (flash.value === next.seq) flash.value = null }, 1600)
}
const companyOpen = ref(false) // "Open to company" sheet (group quests)
const style = computed(() => STYLES[m.value?.style] || STYLES.budget)
// Live "leave by" from where the traveller is; refreshed every 30 s of the app clock.
const clockStep = computed(() => Math.floor(tick.value / 30000))
const leaveBy = computed(() => (clockStep.value, m.value ? store.leaveBy() : null))

const modeIcon = { walk: 'bi-person-walking', mrt: 'bi-train-front', taxi: 'bi-taxi-front' }
const modePill = { walk: '', mrt: 'ink', taxi: 'pale' }

/** Outdoor legs whose visit hour is forecast > 60% rain (or forced rain from /dev). */
const wetLegs = computed(() => {
  if (!m.value) return []
  const rainAt = rainLookup(ui.weather, ui.forceRain)
  return m.value.legs.filter((l) => l.kind === 'visit' && l.status === 'pending' && l.indoor === false && rainAt(Date.parse(l.arrive_iso)) > RAIN_LIMIT)
})

// Hand edits: one stop's edit panel open at a time, and one place picker (swap / add).
const editing = ref(null) // place_id of the leg whose edit panel is open (seq changes on every edit)
const picker = ref(null) // { key, mode: 'swap' | 'add', leg, near, title }
const busy = ref(false)
const pendingVisits = computed(() => store.visitLegs.filter((l) => l.status === 'pending'))
const missionPlaceIds = computed(() => new Set(m.value?.legs.map((l) => l.place_id) || []))

function toggleEdit(leg) {
  editing.value = editing.value === leg.place_id ? null : leg.place_id
  picker.value = null
}
function openSwap(leg) {
  picker.value = { key: leg.place_id, mode: 'swap', leg, near: leg, title: `Swap ${leg.name} for…` }
}
function openAdd(leg) {
  const near = leg || pendingVisits.value.at(-1) || m.value.origin
  picker.value = { key: leg ? leg.place_id : 'end', mode: 'add', leg, near, title: leg ? `Add a stop after ${leg.name}` : 'Add a stop before heading back' }
}
async function run(action) {
  busy.value = true
  try {
    const ok = await action()
    if (ok) { picker.value = null; editing.value = null }
  } catch (err) {
    ui.toast(err.message, 'danger')
  } finally {
    busy.value = false
  }
}
function onPick(place) {
  const { mode, leg } = picker.value
  run(() => (mode === 'swap' ? store.swapStop(leg, place) : store.addStop(place, leg?.place_id ?? null)))
}
watch(() => m.value?.id, () => { editing.value = null; picker.value = null })

const replans = [
  { mode: 'behind', label: "I'm behind", icon: 'bi-hourglass-bottom' },
  { mode: 'less-walking', label: 'Less walking', icon: 'bi-train-front' },
  { mode: 'swap', label: 'Swap next stop', icon: 'bi-arrow-left-right' },
  { mode: 'rain', label: 'Rain plan', icon: 'bi-umbrella' }
]
</script>

<template>
  <main class="zt-page">
    <div v-if="!m" class="text-center py-5">
      <div v-if="store.status === 'planning'" class="spinner-border text-primary"></div>
      <template v-else>
        <i class="bi bi-signpost-split display-4 text-muted"></i>
        <h1 class="h4 mt-3">No mission yet</h1>
        <p class="text-muted">Tell us your layover and we’ll build one.</p>
        <RouterLink to="/plan" class="btn btn-primary">Plan a layover</RouterLink>
      </template>
    </div>

    <template v-else>
      <!-- Pills + countdown share the top row so the title gets the full width. -->
      <header class="mhead mb-3">
        <div class="mhead-top">
          <div class="pills">
            <span class="zt-pill"><i class="bi" :class="style.icon"></i> {{ style.label }}</span>
            <span v-if="m.source === 'groq'" class="zt-pill ink" :title="m.groq_model"><i class="bi bi-stars"></i> Groq</span>
            <span v-else class="zt-pill paper" :title="m.fallback_reason || ''"><i class="bi bi-cpu"></i> Offline</span>
            <span v-if="m.replans" class="zt-pill pale">Replanned ×{{ m.replans }}</span>
          </div>
          <TimeToGate :must-return-ms="store.mustReturnMs" :start-ms="Date.parse(m.start_iso)" />
        </div>
        <h1 class="title">{{ m.title }}</h1>
        <div class="meta">
          <span><i class="bi bi-geo-alt"></i> From {{ m.origin.label }}</span>
          <span><i class="bi bi-patch-check"></i> {{ store.stampedCount }}/{{ store.visitLegs.length }} stamped</span>
        </div>
        <div class="mt-2">
          <RouterLink :to="`/mission/${m.id}/schedule`" class="btn btn-sm btn-soft">
            <i class="bi bi-calendar3"></i> Edit schedule
          </RouterLink>
        </div>
      </header>

      <LayoverCard :mission="m" :leave-by-ms="leaveBy?.ms ?? null" class="mb-3" />

      <div v-if="wetLegs.length" class="alert rain-alert d-flex align-items-center gap-3" role="alert">
        <i class="bi bi-cloud-lightning-rain fs-3"></i>
        <div class="flex-grow-1 small">
          <b>Rain likely during {{ wetLegs.map((l) => l.name).join(', ') }}.</b>
          Swap outdoor stops for indoor ones nearby?
        </div>
        <button class="btn btn-sm" :disabled="store.status === 'planning'" @click="store.replan('rain')">Indoor rewrite</button>
      </div>

      <ol class="timeline list-unstyled">
        <li class="tl-start">
          <div class="dot start"><i class="bi bi-airplane-fill"></i></div>
          <div class="small"><b class="mono">{{ formatTime(Date.parse(m.start_iso) + m.buffers.exit_min * 60000) }}</b> Leave {{ m.origin.label }}<span v-if="m.buffers.exit_min" class="text-muted"> (after {{ m.buffers.exit_min }} min immigration)</span></div>
        </li>
        <li v-if="doneCount" class="tl-done-toggle">
          <div class="dot done"><i class="bi bi-check-lg"></i></div>
          <button type="button" class="btn btn-link btn-sm p-0 text-reset fw-800" :aria-expanded="showDone" @click="showDone = !showDone">
            {{ doneCount }} completed stop{{ doneCount === 1 ? '' : 's' }} · <span class="text-decoration-underline">{{ showDone ? 'Hide' : 'Show' }}</span>
          </button>
        </li>
        <template v-for="leg in m.legs" :key="leg.seq + leg.place_id">
          <!-- Done: a compact greyed line, only when expanded -->
          <template v-if="isDone(leg)">
            <li v-if="showDone" class="tl-done">
              <div class="dot done"><i class="bi" :class="leg.status === 'stamped' ? 'bi-patch-check-fill' : 'bi-skip-forward-fill'"></i></div>
              <div class="done-row small">
                <RouterLink :to="`/place/${leg.place_id}`" class="text-reset fw-800">{{ leg.name }}</RouterLink>
                <span class="text-muted"> · {{ leg.status === 'stamped' ? `Stamped ${leg.stamped_at ? formatTime(leg.stamped_at) : ''}` : 'Skipped' }}</span>
              </div>
            </li>
          </template>
          <template v-else>
          <li class="tl-travel">
            <span class="zt-pill" :class="modePill[leg.travel_mode]"><i class="bi" :class="modeIcon[leg.travel_mode]"></i> {{ leg.travel_min }} min</span>
            <span class="tiny text-muted ms-2">{{ leg.travel_detail }}</span>
          </li>
          <li :id="`leg-${leg.seq}`" :class="['tl-stop', leg.kind, leg.status, { next: store.nextLeg === leg, flash: flash === leg.seq }]">
            <div class="dot">
              <i v-if="leg.kind === 'return'" class="bi bi-house-door-fill"></i>
              <i v-else-if="leg.status === 'stamped'" class="bi bi-patch-check-fill"></i>
              <span v-else>{{ leg.seq }}</span>
            </div>
            <div class="zt-card p-3 stop-card" :class="{ joined: leg.fixed }" :tabindex="store.nextLeg === leg ? -1 : undefined">
              <StopGallery v-if="leg.kind === 'visit' && placeById.get(leg.place_id)" :place="placeById.get(leg.place_id)" class="mb-3" />
              <div class="d-flex justify-content-between gap-2">
                <div class="flex-grow-1">
                  <div class="tiny text-muted fw-800 mono">
                    {{ formatTime(leg.arrive_iso) }}<template v-if="leg.kind === 'visit'">–{{ formatTime(leg.depart_iso) }} · stay {{ leg.stay_min }} min</template>
                    <template v-else> · must arrive by {{ formatTime(leg.arrive_by) }}</template>
                  </div>
                  <h2 class="h6 mb-1">
                    <RouterLink v-if="leg.kind === 'visit'" :to="`/place/${leg.place_id}`" class="text-reset">{{ leg.name }}</RouterLink>
                    <span v-else>{{ leg.name }}</span>
                  </h2>
                </div>
                <div class="text-end">
                  <span class="zt-pill pink text-nowrap">+{{ leg.xp }} XP</span>
                  <div v-if="leg.kind === 'visit'" class="tiny mt-1" :class="leg.indoor ? 'text-muted' : 'fw-800'">
                    <i class="bi" :class="leg.indoor ? 'bi-house' : 'bi-sun'"></i> {{ leg.indoor ? 'Indoor' : 'Outdoor' }}
                  </div>
                </div>
              </div>
              <p class="small mb-2 why">{{ leg.why }}</p>
              <p v-if="leg.kind === 'visit' && placeById.get(leg.place_id)?.hours_verified === false" class="tiny fw-800 mb-2 hours-note">
                <i class="bi bi-exclamation-circle"></i> Opening hours not confirmed, check before going
              </p>
              <div v-if="leg.sidequest" class="zt-pill pale mb-2"><i class="bi bi-gem"></i> Sidequest</div>
              <template v-if="leg.fixed && leg.status === 'pending'">
                <div class="d-flex gap-2 flex-wrap align-items-center">
                  <RouterLink :to="`/map?focus=${leg.seq}`" class="btn btn-sm btn-soft"><i class="bi bi-geo"></i> On map</RouterLink>
                  <button type="button" class="btn btn-sm btn-primary" @click="party.openChat(leg.party_id)"><i class="bi bi-chat-dots-fill"></i> Chat</button>
                  <RouterLink :to="`/quests/${leg.party_id}`" class="btn btn-sm btn-soft"><i class="bi bi-people-fill"></i> Quest</RouterLink>
                  <span class="tiny text-muted"><i class="bi bi-lock-fill"></i> Fixed time with {{ leg.with_host }}</span>
                </div>
              </template>
              <template v-else-if="leg.kind === 'visit' && leg.status === 'pending'">
                <div class="d-flex gap-2 flex-wrap">
                  <RouterLink :to="`/map?focus=${leg.seq}`" class="btn btn-sm btn-soft"><i class="bi bi-geo"></i> On map</RouterLink>
                  <button class="btn btn-sm btn-soft" :class="{ active: editing === leg.place_id }" :aria-expanded="editing === leg.place_id" @click="toggleEdit(leg)">
                    <i class="bi bi-pencil"></i> Change stop
                  </button>
                  <button class="btn btn-sm btn-link text-muted" @click="store.skip(leg)">Skip</button>
                </div>
                <div v-if="editing === leg.place_id" class="edit-panel mt-3">
                  <div class="tiny fw-800 mb-2">Change this stop</div>
                  <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-sm btn-soft" :disabled="busy" @click="openSwap(leg)"><i class="bi bi-arrow-left-right"></i> Swap</button>
                    <button class="btn btn-sm btn-soft" :disabled="busy" @click="openAdd(leg)"><i class="bi bi-plus-lg"></i> Add after</button>
                    <button class="btn btn-sm btn-link text-danger ms-auto" :disabled="busy" @click="run(() => store.removeStop(leg))"><i class="bi bi-trash"></i> Remove</button>
                  </div>
                  <PlacePicker v-if="picker && picker.key === leg.place_id" :title="picker.title" :near="picker.near"
                    :exclude="missionPlaceIds" :busy="busy" @pick="onPick" @close="picker = null" />
                </div>
              </template>
              <div v-else-if="leg.status === 'stamped'" class="tiny text-success fw-800"><i class="bi bi-check2-circle"></i> Stamped {{ leg.stamped_at ? formatTime(leg.stamped_at) : '' }}</div>
              <div v-else-if="leg.status === 'skipped'" class="tiny text-muted fw-800">Skipped</div>
              <template v-if="leg.kind === 'return' && leg.status === 'pending'">
                <button v-if="!(picker && picker.key === 'end')" class="btn btn-sm btn-soft" :disabled="busy" @click="openAdd(null)">
                  <i class="bi bi-plus-lg"></i> Add a stop before heading back
                </button>
                <PlacePicker v-else :title="picker.title" :near="picker.near" :exclude="missionPlaceIds" :busy="busy"
                  @pick="onPick" @close="picker = null" />
              </template>
            </div>
          </li>
          </template>
        </template>
      </ol>

      <section class="zt-card p-3 mb-3">
        <div class="small fw-800 mb-2"><i class="bi bi-arrow-repeat"></i> Plans change. Rewrite the rest:</div>
        <div class="d-flex flex-wrap gap-2">
          <button v-for="r in replans" :key="r.mode" class="btn btn-soft btn-sm" :disabled="store.status === 'planning'" @click="store.replan(r.mode)">
            <i class="bi" :class="r.icon"></i> {{ r.label }}
          </button>
        </div>
        <p class="tiny text-muted mb-0 mt-2">Stamped stops stay. Only future legs are replaced, from where you are now.</p>
      </section>

      <div class="play-bar d-flex gap-2">
        <button class="btn btn-soft btn-lg company-btn" @click="companyOpen = true" aria-label="Open to company">
          <i class="bi bi-people-fill"></i><span class="d-none d-sm-inline"> Open to company</span>
        </button>
        <button class="btn btn-pop btn-lg flex-grow-1" @click="router.push('/map')"><i class="bi bi-controller"></i> Play on map</button>
      </div>
      <OpenToCompanySheet :mission="m" :open="companyOpen" @close="companyOpen = false" />
    </template>
  </main>
</template>

<style scoped>
.mhead-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.pills .zt-pill { white-space: nowrap; }
.title { font-size: clamp(1.6rem, 6.5vw, 2.3rem); line-height: 1.05; margin: 12px 0 6px; text-wrap: balance; }
.meta { display: flex; flex-wrap: wrap; column-gap: 14px; row-gap: 2px; font-size: 0.84rem; color: var(--zt-muted); }
.meta > span { white-space: nowrap; }
.meta .bi { margin-right: 3px; }
.timeline { position: relative; margin: 0 0 16px; }
.timeline::before { content: ''; position: absolute; left: 18px; top: 8px; bottom: 8px; border-left: 3px dotted var(--zt-line); }
.timeline li { position: relative; padding-left: 52px; }
.tl-start { padding-bottom: 8px; display: flex; align-items: center; min-height: 40px; }
.tl-travel { padding: 6px 0 6px 52px; }
.tl-stop { padding-bottom: 6px; }
.dot { position: absolute; left: 0; top: 10px; width: 39px; height: 39px; border-radius: 50%; background: var(--zt-yellow); color: #111; display: grid; place-items: center; font-weight: 700; font-family: var(--zt-font-head); border: var(--zt-bw) solid var(--zt-line); z-index: 1; }
.tl-start .dot { top: 0; background: var(--zt-card); color: var(--zt-ink); }
.tl-stop.return .dot { background: var(--zt-card); color: var(--zt-ink); }
.tl-stop.stamped .dot { background: #111; color: var(--zt-yellow); border-color: #111; }
[data-bs-theme='dark'] .tl-stop.stamped .dot { border-color: var(--zt-yellow); }
.tl-stop.skipped { opacity: 0.5; }
.tl-stop.next .dot { background: var(--zt-pink); animation: zt-pulse 1.4s infinite; }
.tl-stop.next .stop-card { box-shadow: 5px 5px 0 var(--zt-pink); }
.tl-stop.next .stop-card:focus { outline: none; }
.tl-stop.flash .stop-card { animation: leg-flash 1.6s ease-out; }
@keyframes leg-flash { 0%, 40% { outline: 4px solid var(--zt-pink); outline-offset: 4px; } 100% { outline: 4px solid transparent; outline-offset: 4px; } }
.tl-done-toggle, .tl-done { display: flex; align-items: center; min-height: 34px; padding-bottom: 6px; }
.tl-done { opacity: 0.6; }
.dot.done { width: 28px; height: 28px; left: 5px; top: 3px; font-size: 0.8rem; background: var(--zt-card); color: var(--zt-muted); border-color: var(--zt-muted); }
.done-row { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stop-card { box-shadow: var(--zt-shadow-sm); }
.stop-card.joined { border-color: var(--zt-pink); }
.why { color: var(--zt-muted); }
.hours-note { color: #b45309; }
[data-bs-theme='dark'] .hours-note { color: var(--zt-yellow); }
.edit-panel { border-top: 2px dashed var(--zt-soft-line); padding-top: 12px; }
.rain-alert { background: #111; color: var(--zt-yellow); border: var(--zt-bw) solid #111; border-radius: 18px; box-shadow: 4px 4px 0 var(--zt-yellow); }
[data-bs-theme='dark'] .rain-alert { border-color: var(--zt-yellow); }
.rain-alert .btn { --bs-btn-bg: var(--zt-yellow); --bs-btn-color: #111; --bs-btn-border-color: var(--zt-yellow); }
.play-bar { position: sticky; bottom: calc(var(--zt-nav-h) + 24px); z-index: 5; }
</style>
