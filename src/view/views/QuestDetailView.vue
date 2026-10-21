<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { usePartyStore } from '../../model/stores/party.js'
import { useMissionStore } from '../../model/stores/mission.js'
import { useUserStore } from '../../model/stores/user.js'
import { useUiStore } from '../../model/stores/ui.js'
import { stopsFit, joinableRange, previewJoin } from '../../model/services/social.js'
import { formatTime } from '../../model/services/hours.js'
import { DEV_PANEL } from '../../model/services/config.js'
import { STYLES } from '../../model/data/origins.js'
import MemberAvatarStack from '../components/MemberAvatarStack.vue'
import ProfilePreviewModal from '../components/ProfilePreviewModal.vue'
import StopRangePicker from '../components/StopRangePicker.vue'
import JoinConfirmSheet from '../components/JoinConfirmSheet.vue'

/**
 * One open window: ONLY its stops (the host's other stops, airport and flight time are never sent),
 * who's going and which stops they joined. A guest picks a run of stops, sees exactly what changes
 * in their own plan (confirm sheet), and joins.
 */
const route = useRoute()
const router = useRouter()
const party = usePartyStore()
const mission = useMissionStore()
const user = useUserStore()
const ui = useUiStore()

const profile = ref(null) // profile preview modal
const busy = ref(false)

async function load() {
  await mission.loadActive()
  await party.loadQuest(route.params.id)
  // The host may have closed the quest or changed my stops since I joined.
  if (mission.mission?.joined) await mission.checkJoined()
}
onMounted(load)
watch(() => route.params.id, (id) => id && load())

const q = computed(() => (party.quest?.id === route.params.id ? party.quest : null))
const host = computed(() => q.value?.roster.find((m) => m.role === 'host'))
const isHost = computed(() => q.value?.host_id === user.userId)
const style = computed(() => STYLES[q.value?.style])
const fit = computed(() => (q.value && !isHost.value ? stopsFit(q.value.stops, mission.mission) : null))
const spots = computed(() => (q.value ? q.value.capacity - q.value.roster.length : 0))
/** Who's at each stop: roster members whose joined range covers it. */
const goingAt = (seq) => q.value.roster.filter((m) => seq >= m.from_seq && seq <= m.to_seq)

async function act(fn, okMsg) {
  busy.value = true
  try {
    const msg = await fn()
    if (okMsg) ui.toast(typeof okMsg === 'function' ? okMsg(msg) : okMsg, 'success', 4000)
  } catch (err) {
    ui.toast(err.message, 'danger', 5000)
  } finally {
    busy.value = false
  }
}
function closeQuest() {
  if (!confirm('Close this open quest? Anyone who joined goes back to their own plan.')) return
  act(() => party.closeWindow(q.value.id), 'Quest closed.').then(() => router.replace('/quests'))
}
function deleteQuest() {
  if (!confirm('Delete this quest for good? Its chat is deleted too.')) return
  act(() => party.deleteQuest(q.value.id), 'Quest deleted.').then(() => router.replace('/quests'))
}
const demoJoin = () => act(() => party.simulate(q.value.id, 'guest_joins'), (m) => `Demo: ${m}.`)

// ── Guest: pick stops → confirm → join ──
const plan = computed(() => mission.mission)
const hasPlan = computed(() => fit.value && fit.value.code !== 'no_mission')
const range = computed(() => (q.value && hasPlan.value ? joinableRange(q.value.stops, plan.value) : { minFrom: 1, maxTo: 0 }))
const canPick = computed(() => range.value.minFrom <= range.value.maxTo)
const pick = ref({ from: 1, to: 1 })
// Start with everything that fits; reset when the quest or my plan changes.
watch([() => q.value?.id, range], () => { pick.value = { from: range.value.minFrom, to: range.value.maxTo } }, { immediate: true })
const preview = computed(() => (q.value && hasPlan.value && canPick.value ? previewJoin(q.value, pick.value.from, pick.value.to, plan.value) : null))
/** Already with someone else (one quest at a time). */
const otherQuest = computed(() => {
  const joined = plan.value?.joined || {}
  const id = Object.keys(joined).find((k) => k !== q.value?.id)
  return id ? { id, ...joined[id] } : null
})
const confirmOpen = ref(false)
async function join() {
  busy.value = true
  try {
    await mission.joinQuest(q.value, pick.value.from, pick.value.to)
    confirmOpen.value = false
    ui.toast(`You're in! Meet ${host.value?.display_name || 'the host'} at ${q.value.stops[pick.value.from - 1].name}.`, 'success', 5000)
    await party.loadQuest(q.value.id)
  } catch (err) {
    ui.toast(err.message, 'danger', 6000)
  } finally {
    busy.value = false
  }
}
function leave() {
  if (!confirm('Leave this quest?')) return
  act(async () => {
    await mission.leaveQuest(q.value.id)
    await party.loadQuest(q.value.id)
  }, "You're solo again.")
}
</script>

<template>
  <main class="zt-page">
    <button type="button" class="btn btn-link btn-sm px-0 mb-2" @click="router.back()"><i class="bi bi-arrow-left"></i> Back</button>

    <div v-if="party.questStatus.loading && !q" class="text-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <div v-else-if="!q" class="zt-card p-4 text-center">
      <i class="bi bi-door-closed display-5 text-muted"></i>
      <h1 class="h5 mt-2">{{ party.questStatus.guest ? 'Sign in to see open quests' : 'Quest not available' }}</h1>
      <p class="small text-muted">{{ party.questStatus.error }}</p>
      <RouterLink to="/quests" class="btn btn-primary">Browse open quests</RouterLink>
    </div>

    <template v-else>
      <header class="mb-3">
        <div class="d-flex flex-wrap gap-2 mb-2">
          <span v-if="isHost" class="zt-pill pink"><i class="bi bi-star-fill"></i> Your quest</span>
          <span class="zt-pill" :class="q.status === 'open' ? 'pale' : 'paper'">{{ q.status === 'open' ? `${spots} spot${spots === 1 ? '' : 's'} left` : q.status === 'full' ? 'Full' : 'Closed' }}</span>
          <span v-if="style" class="zt-pill paper"><i class="bi" :class="style.icon"></i> {{ style.label }}</span>
          <span v-if="fit && fit.code !== 'no_mission'" class="zt-pill" :class="fit.ok ? 'fit-ok' : 'fit-no'">
            <i class="bi" :class="fit.ok ? 'bi-check-circle-fill' : 'bi-airplane'"></i> {{ fit.reason }}
          </span>
        </div>
        <h1 class="title mb-1">{{ q.title }}</h1>
        <p class="small text-muted mb-0">With <b>{{ host?.display_name || 'a traveller' }}</b> · {{ formatTime(q.starts_at) }}–{{ formatTime(q.ends_at) }}</p>
      </header>

      <!-- Meeting point -->
      <section class="zt-card p-3 mb-3">
        <div class="d-flex gap-3 align-items-start">
          <div class="meet-icon"><i class="bi bi-geo-alt-fill"></i></div>
          <div class="flex-grow-1">
            <div class="tiny text-muted fw-800 text-uppercase">Meet · {{ formatTime(q.starts_at) }}</div>
            <div class="fw-800">{{ q.meeting_label }}</div>
            <p v-if="q.note" class="small mb-0 mt-1 note">“{{ q.note }}”</p>
          </div>
        </div>
        <div class="tiny text-muted mt-2"><i class="bi bi-shield-check"></i> Public place. Live location is only shared between people who've joined.</div>
      </section>

      <!-- Open stops + who's at each -->
      <section class="zt-card p-3 mb-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <b class="small">Open stops</b>
          <MemberAvatarStack :members="q.roster" :capacity="q.capacity" :size="30" @select="profile = $event" />
        </div>
        <ol class="stops">
          <li v-for="s in q.stops" :key="s.seq">
            <span class="dot">{{ s.seq }}</span>
            <div class="flex-grow-1 min-w-0">
              <div class="d-flex justify-content-between gap-2">
                <RouterLink :to="`/place/${s.place_id}`" class="fw-800 text-reset text-truncate">{{ s.name }}</RouterLink>
                <span class="tiny mono text-muted text-nowrap">{{ formatTime(s.arrive_iso) }}–{{ formatTime(s.depart_iso) }}</span>
              </div>
              <div class="tiny text-muted">{{ s.area }} · {{ s.stay_min }} min
                <template v-if="goingAt(s.seq).length"> · <i class="bi bi-people-fill"></i> {{ goingAt(s.seq).map((m) => m.display_name).join(', ') }}</template>
              </div>
            </div>
          </li>
        </ol>
        <p class="tiny text-muted mb-0 mt-2"><i class="bi bi-eye-slash"></i> You only see the stops {{ host?.display_name || 'the host' }} opened. Everyone keeps their own return-by.</p>
      </section>

      <!-- Action -->
      <section class="action zt-card p-3">
        <template v-if="isHost">
          <div class="fw-800 mb-1"><i class="bi bi-star-fill"></i> This is your open quest</div>
          <p class="small text-muted mb-2">This is exactly what guests see. Edit your plan on the Mission page and it updates here.</p>
          <button v-if="DEV_PANEL && q.status === 'open'" class="btn btn-sm btn-dark w-100 mb-2" :disabled="busy" @click="demoJoin">
            <i class="bi bi-robot"></i> Demo: a traveller joins
          </button>
          <div class="d-flex gap-2">
            <button class="btn btn-soft flex-grow-1" :disabled="busy" @click="closeQuest"><i class="bi bi-x-circle"></i> Close</button>
            <button class="btn btn-outline-danger" :disabled="busy" @click="deleteQuest" aria-label="Delete quest"><i class="bi bi-trash3"></i></button>
          </div>
        </template>
        <template v-else-if="q.mine">
          <div class="fw-800 text-success mb-1"><i class="bi bi-check-circle-fill"></i>
            You're joining {{ q.mine.from_seq === q.mine.to_seq ? `stop ${q.mine.from_seq}` : `stops ${q.mine.from_seq}–${q.mine.to_seq}` }}
          </div>
          <p class="small text-muted mb-2">They're in your plan at fixed times. Meet at {{ q.stops[q.mine.from_seq - 1]?.name }}, {{ formatTime(q.stops[q.mine.from_seq - 1]?.arrive_iso) }}.</p>
          <div class="d-flex gap-2">
            <RouterLink to="/mission" class="btn btn-soft flex-grow-1"><i class="bi bi-list-ol"></i> My plan</RouterLink>
            <button class="btn btn-outline-danger" :disabled="busy" @click="leave"><i class="bi bi-box-arrow-right"></i> Leave</button>
          </div>
        </template>
        <template v-else-if="!hasPlan">
          <div class="fw-800 mb-1">Plan your layover first</div>
          <p class="small text-muted mb-2">We need your airport time to check which stops you can make.</p>
          <RouterLink to="/plan" class="btn btn-primary w-100">Plan my layover</RouterLink>
        </template>
        <template v-else-if="otherQuest">
          <div class="fw-800 mb-1">You're already with {{ otherQuest.host_name }}</div>
          <p class="small text-muted mb-2">One quest at a time. Leave "{{ otherQuest.title }}" to join this one.</p>
          <RouterLink :to="`/quests/${otherQuest.id}`" class="btn btn-soft w-100">Go to that quest</RouterLink>
        </template>
        <template v-else-if="q.status === 'full'">
          <div class="fw-800 mb-1">This quest is full</div>
          <p class="small text-muted mb-0">Check back later, or open some of your own stops to company.</p>
        </template>
        <template v-else-if="!canPick">
          <div class="fw-800 mb-1"><i class="bi bi-airplane"></i> None of these stops fit your layover</div>
          <p class="small text-muted mb-0">{{ fit.code === 'too_late' ? fit.detail : 'They start before you are out of the airport, or have already started.' }}</p>
        </template>
        <template v-else>
          <div class="fw-800 mb-2">Pick the stops you'll join</div>
          <StopRangePicker v-model="pick" :stops="q.stops" :min-from="range.minFrom" :max-to="range.maxTo" inside-label="Join" />
          <p v-if="preview?.ok" class="small mt-2 mb-2" :class="preview.bigChange ? 'text-danger fw-800' : 'text-muted'">
            <template v-if="preview.removed.length"><i class="bi bi-arrow-repeat"></i> Replaces {{ preview.removed.length }} of your stops.</template>
            <template v-else><i class="bi bi-check2-circle"></i> Fits around your plan; none of your stops are removed.</template>
          </p>
          <button class="btn btn-primary w-100" :disabled="busy || !preview" @click="confirmOpen = true">
            <i class="bi bi-people-fill"></i> Join {{ pick.from === pick.to ? `stop ${pick.from}` : `stops ${pick.from}–${pick.to}` }}
          </button>
        </template>
      </section>
    </template>

    <ProfilePreviewModal :profile="profile" @close="profile = null" />
    <JoinConfirmSheet :open="confirmOpen" :preview="preview" :busy="busy" @close="confirmOpen = false" @confirm="join" />
  </main>
</template>

<style scoped>
.title { font-size: clamp(1.7rem, 7vw, 2.3rem); }
.meet-icon { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: var(--zt-pink); color: #111; font-size: 1.2rem; border: 2px solid var(--zt-line); flex: none; }
.note { padding: 6px 10px; border-radius: 12px; background: var(--zt-yellow-pale); color: #111; }
.stops { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.stops li { display: flex; gap: 10px; align-items: flex-start; }
.stops .dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--zt-yellow); color: #111; border: 2px solid #111; font-weight: 800; font-size: 0.8rem; flex: none; }
.min-w-0 { min-width: 0; }
.action { box-shadow: var(--zt-shadow); }
.fit-ok { background: #5fd38d; color: #111; }
.fit-no { background: var(--zt-card); color: var(--zt-muted); }
</style>
