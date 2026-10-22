<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionStore } from '../../model/stores/mission.js'
import { usePartyStore } from '../../model/stores/party.js'
import { useUserStore } from '../../model/stores/user.js'
import { useUiStore } from '../../model/stores/ui.js'
import * as social from '../../model/services/social.js'
import { formatTime } from '../../model/services/hours.js'
import { tick } from '../../model/services/clock.js'
import { geo, hasFix } from '../../model/services/geo.js'
import { distanceM } from '../../model/services/travel.js'
import { DEV_PANEL } from '../../model/services/config.js'
import { syncMemberMarkers, clearMemberMarkers } from '../map/memberMarkers.js'

/**
 * Map HUD for a social quest: "With Mei until 15:40 · Your plan resumes: Gardens", Go solo.
 * While the joined stops run it also shares my location with the other members and shows theirs
 * (from 30 min before the meet-up until my last joined stop ends), and when they end it puts me
 * back on my own plan. Hosts with guests see "Hosting Lina until …".
 * getMap: () => the MapLibre map (or null before it loads).
 */
const props = defineProps({ getMap: { type: Function, required: true } })

const store = useMissionStore()
const party = usePartyStore()
const user = useUserStore()
const ui = useUiStore()
const router = useRouter()

const LIVE_BEFORE_MIN = 30 // start sharing this long before the meet-up
const SEND_EVERY_MS = 15000
const STALE_MS = 2 * 60000

onMounted(() => {
  if (store.mission) party.loadHosted(store.mission).catch(() => {}) // guest mode / offline: no hosting chip
})

const joined = computed(() => store.joinedQuest)
const hostedLive = computed(() => {
  const h = party.hosted
  return h && h.status !== 'closed' && h.roster?.length > 1 && Date.parse(h.ends_at) > tick.value ? h : null
})
/** What the chip is about: { id, role, startMs, endMs } */
const active = computed(() => {
  if (joined.value) return { id: joined.value.id, role: 'guest', startMs: joined.value.startMs, endMs: joined.value.endMs }
  if (hostedLive.value) return { id: hostedLive.value.id, role: 'host', startMs: Date.parse(hostedLive.value.starts_at), endMs: Date.parse(hostedLive.value.ends_at) }
  return null
})
const started = computed(() => active.value && tick.value >= active.value.startMs)
const guestNames = computed(() => (hostedLive.value?.roster || []).filter((m) => m.role !== 'host').map((m) => m.display_name))
const resume = computed(() => store.resumeLeg)

// ── My joined stops are over → back to my own plan ──
watch(() => joined.value && tick.value >= joined.value.endMs, (over) => { if (over) store.finishEndedQuests() })

// ── Live location ──
const live = computed(() => !!active.value && tick.value >= active.value.startMs - LIVE_BEFORE_MIN * 60000 && tick.value < active.value.endMs)
const roster = ref([])
const locations = ref([])
const markers = new Map()
let unwatch = null
let poll = null
let lastSent = { ms: 0, lat: null, lng: null }
let livePartyId = null

async function refreshLocations() {
  if (!livePartyId) return
  try { locations.value = await social.listLocations(livePartyId) } catch { /* offline: keep the last ones */ }
}
async function startLive(id) {
  livePartyId = id
  try { roster.value = (await social.getQuest(id))?.roster || [] } catch { roster.value = [] }
  await refreshLocations()
  try { unwatch = await social.watchLocations(id, refreshLocations) } catch { unwatch = null }
  poll = setInterval(refreshLocations, 20000) // in case Realtime drops
  sendMine(true)
}
async function stopLive({ forget = false } = {}) {
  const id = livePartyId
  livePartyId = null
  clearInterval(poll)
  unwatch?.()
  unwatch = null
  locations.value = []
  clearMemberMarkers(markers)
  lastSent = { ms: 0, lat: null, lng: null }
  // The window ended or I left: take my dot off the others' maps (leaving already does this server-side).
  if (forget && id) social.stopSharing(id).catch(() => {})
}
watch(() => (live.value ? active.value.id : null), async (id, old) => {
  if (old) await stopLive({ forget: true })
  if (id) await startLive(id)
}, { immediate: true })
onUnmounted(() => stopLive())

function sendMine(force = false) {
  if (!livePartyId || !hasFix()) return
  const moved = lastSent.lat == null ? Infinity : distanceM({ lat: lastSent.lat, lng: lastSent.lng }, geo)
  if (!force && (Date.now() - lastSent.ms < SEND_EVERY_MS || moved < 10)) return
  lastSent = { ms: Date.now(), lat: geo.lat, lng: geo.lng }
  social.shareLocation(livePartyId, { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy }).catch(() => {})
}
watch(() => [geo.lat, geo.lng], () => sendMine())

const others = computed(() => locations.value
  .filter((l) => l.user_id !== user.userId)
  .map((l) => {
    const p = roster.value.find((r) => r.user_id === l.user_id)
    return { ...l, display_name: p?.display_name, cover_color: p?.cover_color, stale: (tick.value, Date.now()) - Date.parse(l.updated_at) > STALE_MS } // server time, not the dev clock
  }))
// Not deep: the map is a huge object, and walking it every second freezes the page.
watch([others, () => props.getMap()], ([list, map]) => {
  if (map) syncMemberMarkers(map, markers, list)
})

// ── Actions ──
const busy = ref(false)
async function goSolo() {
  const ok = await party.ask({
    title: 'Go solo?', icon: 'bi-person-walking', confirmText: 'Go solo', cancelText: 'Stay',
    body: `You'll leave ${joined.value.host_name}'s quest and carry on with your own plan.`
  })
  if (!ok) return
  busy.value = true
  try {
    await store.leaveQuest(joined.value.id)
  } catch (err) {
    ui.toast(err.message, 'danger', 5000)
  } finally {
    busy.value = false
  }
}
async function demoLocate() {
  try {
    ui.toast(`Demo: ${await party.simulate(active.value.id, 'locate')}.`, 'success')
    if (!roster.value.length) roster.value = (await social.getQuest(active.value.id))?.roster || []
    await refreshLocations()
  } catch (err) {
    ui.toast(err.message, 'danger', 5000)
  }
}
</script>

<template>
  <div v-if="active" class="coop-chip" role="button" tabindex="0" :aria-label="`${active.role === 'guest' ? 'With ' + joined.host_name : 'Hosting'}: open my plan`"
    @click="router.push('/mission')" @keydown.enter="router.push('/mission')">
    <i class="bi bi-people-fill coop-icon" aria-hidden="true"></i>
    <div class="flex-grow-1 min-w-0">
      <template v-if="active.role === 'guest'">
        <div class="coop-main text-truncate">
          <template v-if="started">With {{ joined.host_name }} until {{ formatTime(active.endMs) }}</template>
          <template v-else>Meet {{ joined.host_name }} at {{ joined.blocks[0].name }}, {{ formatTime(active.startMs) }}</template>
        </div>
        <div class="coop-sub text-truncate">
          <template v-if="resume?.kind === 'visit'">Your plan resumes: {{ resume.name }}</template>
          <template v-else>Then head back to {{ store.mission.origin.label }}</template>
          <template v-if="others.length"> · {{ others.length }} live</template>
        </div>
      </template>
      <template v-else>
        <div class="coop-main text-truncate">Hosting {{ guestNames.join(', ') }} until {{ formatTime(active.endMs) }}</div>
        <div class="coop-sub text-truncate">{{ others.length ? `${others.length} on the map` : 'Locations show 30 min before you meet' }}</div>
      </template>
    </div>
    <div class="d-flex gap-1 flex-none">
      <button v-if="DEV_PANEL && live" type="button" class="coop-btn" title="Demo: put the others on the map" aria-label="Demo: put the others on the map" @click.stop="demoLocate"><i class="bi bi-robot"></i></button>
      <button v-if="active.role === 'guest'" type="button" class="coop-btn solo" :disabled="busy" @click.stop="goSolo">Go solo</button>
    </div>
  </div>
</template>

<style scoped>
.coop-chip { cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 8px 10px; border-radius: 16px; background: var(--zt-pink); color: #111; border: 3px solid #111; }
.coop-icon { font-size: 1.2rem; }
.coop-main { font-weight: 800; font-size: 0.9rem; line-height: 1.2; }
.coop-sub { font-size: 0.75rem; font-weight: 600; opacity: 0.85; }
.coop-btn { display: inline-grid; place-items: center; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 99px; border: 2px solid #111; background: #fff4c2; color: #111; font-weight: 800; font-size: 0.75rem; text-decoration: none; }
.coop-btn.solo { background: #111; color: #ffcc00; }
.coop-btn:disabled { opacity: 0.6; }
.min-w-0 { min-width: 0; }
.flex-none { flex: none; }
</style>
