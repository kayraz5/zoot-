<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useMissionStore } from '../../model/stores/mission.js'
import { usePartyStore } from '../../model/stores/party.js'
import { useUserStore } from '../../model/stores/user.js'
import * as social from '../../model/services/social.js'
import { tick } from '../../model/services/clock.js'
import { geo, hasFix } from '../../model/services/geo.js'
import { distanceM } from '../../model/services/travel.js'
import { syncMemberMarkers, clearMemberMarkers } from '../map/memberMarkers.js'
import { useActiveQuest } from '../composables/useActiveQuest.js'

/**
 * The social-quest side of the map, with no UI of its own (the chip is QuestCoopChip):
 *  - shares my location with the other members while the quest is live, and draws theirs as pins;
 *  - when my joined stops are over, puts me back on my own plan.
 * Mounted once by the map view and always on, even when the next-stop card is hidden.
 * getMap: () => the MapLibre map, or null before it has loaded.
 */
const props = defineProps({ getMap: { type: Function, required: true } })

const store = useMissionStore()
const party = usePartyStore()
const user = useUserStore()
const { joined, active, live } = useActiveQuest()

const SEND_EVERY_MS = 15000
const STALE_MS = 2 * 60000

// Hosts: find my open window so "Hosting Lina until …" and the pins work too.
onMounted(() => {
  if (store.mission) party.loadHosted(store.mission).catch(() => {}) // guest mode / offline: nothing to host
})

// ── My joined stops are over → back to my own plan ──
// immediate: also when the map opens after they already ended.
watch(() => joined.value && tick.value >= joined.value.endMs, (over) => { if (over) store.finishEndedQuests() }, { immediate: true })

// ── Live locations ──
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
  party.liveOthers = []
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

// The chip's demo button moved people: re-read now (and the roster, if it was empty).
watch(() => party.liveRefresh, async () => {
  if (livePartyId && !roster.value.length) {
    try { roster.value = (await social.getQuest(livePartyId))?.roster || [] } catch {}
  }
  refreshLocations()
})

function sendMine(force = false) {
  if (!livePartyId || !hasFix()) return
  const moved = lastSent.lat == null ? Infinity : distanceM({ lat: lastSent.lat, lng: lastSent.lng }, geo)
  if (!force && (Date.now() - lastSent.ms < SEND_EVERY_MS || moved < 10)) return
  lastSent = { ms: Date.now(), lat: geo.lat, lng: geo.lng }
  social.shareLocation(livePartyId, { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy }).catch(() => {})
}
watch(() => [geo.lat, geo.lng], () => sendMine())

// Other members as pins. Not a deep watch: the map is a huge object, and walking it every
// second (the clock ticks) freezes the page.
watch([locations, roster, tick, () => props.getMap()], ([list, people, , map]) => {
  const others = list
    .filter((l) => l.user_id !== user.userId)
    .map((l) => {
      const p = people.find((r) => r.user_id === l.user_id)
      // updated_at is server time, so compare with the real clock, not the dev clock.
      return { ...l, display_name: p?.display_name, cover_color: p?.cover_color, stale: Date.now() - Date.parse(l.updated_at) > STALE_MS }
    })
  party.liveOthers = others
  if (map) syncMemberMarkers(map, markers, others)
})
</script>

<template>
  <!-- No UI: the chip (QuestCoopChip) shows the quest; this draws pins on the map. -->
</template>
