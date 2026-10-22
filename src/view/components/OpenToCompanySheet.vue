<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { usePartyStore } from '../../model/stores/party.js'
import { useUiStore } from '../../model/stores/ui.js'
import { useUserStore } from '../../model/stores/user.js'
import { openableStops, GuestModeError, defaultQuestTitle } from '../../model/services/social.js'
import { formatTime } from '../../model/services/hours.js'
import { DEV_PANEL } from '../../model/services/config.js'
import StopRangePicker from './StopRangePicker.vue'
import MemberAvatarStack from './MemberAvatarStack.vue'

/**
 * Host bottom sheet on my own mission: open ONE run of consecutive stops to company.
 * Guests only ever see those stops (the database stores nothing else), and join instantly.
 */
const props = defineProps({ mission: { type: Object, required: true }, open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])
const party = usePartyStore()
const ui = useUiStore()
const user = useUserStore()

const loading = ref(false)
const error = ref(null)
const guest = ref(false)
const busy = ref(false)
const range = ref({ from: 1, to: 1 })
const capacity = ref(4)
const note = ref('')
const title = ref('')
const titleFallback = computed(() => defaultQuestTitle(user.profile?.display_name))

const stops = computed(() => openableStops(props.mission))
const picked = computed(() => stops.value.slice(range.value.from - 1, range.value.to))
const hosted = computed(() => (party.hostedFor === props.mission.id ? party.hosted : null))
const guests = computed(() => hosted.value?.roster?.filter((m) => m.role !== 'host') || [])

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  range.value = { from: 1, to: Math.max(1, stops.value.length) }
  loading.value = true
  error.value = null
  guest.value = false
  try {
    await party.loadHosted(props.mission)
  } catch (err) {
    guest.value = err instanceof GuestModeError
    error.value = err.message
  } finally {
    loading.value = false
  }
}, { immediate: true })

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
const publish = () => act(() => party.publish({ mission: props.mission, stops: picked.value, capacity: capacity.value, note: note.value, title: title.value.trim() || titleFallback.value }),
  'Open to company! Travellers can now join these stops.')
function closeWindow() {
  const who = guests.value.length ? ` ${guests.value.map((g) => g.display_name).join(', ')} will go back to their own plan.` : ''
  if (!confirm(`Close your open quest?${who}`)) return
  act(() => party.closeWindow(hosted.value.id), 'Quest closed. Your own plan is unchanged.')
}
const demoJoin = () => act(() => party.simulate(hosted.value.id, 'guest_joins'), (m) => `Demo: ${m}.`)
const rangeOf = (m) => (m.from_seq === m.to_seq ? `stop ${m.from_seq}` : `stops ${m.from_seq}–${m.to_seq}`)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
      <section class="sheet zt-card" role="dialog" aria-modal="true" aria-labelledby="otc-title">
        <div class="grabber" aria-hidden="true"></div>
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h2 id="otc-title" class="h4 mb-0">Open to company</h2>
            <p class="small text-muted mb-0">Let other travellers join some of your stops.</p>
          </div>
          <button type="button" class="btn btn-sm btn-soft" aria-label="Close" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
        </div>

        <div v-if="loading" class="py-4 text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading…</span></div></div>

        <div v-else-if="guest" class="alert alert-warning small mb-0">
          <b>Guest mode can't host.</b> {{ error }}
          <div class="mt-2"><RouterLink to="/me" class="btn btn-sm btn-primary" @click="emit('close')">Go to profile to sign in</RouterLink></div>
        </div>

        <div v-else-if="error" class="alert alert-danger small mb-0">Couldn't check your open quest: {{ error }}</div>

        <!-- Already open -->
        <div v-else-if="hosted">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="zt-pill pink"><i class="bi bi-broadcast"></i> {{ hosted.status === 'full' ? 'Full' : 'Open' }}</span>
            <span class="small text-muted">{{ formatTime(hosted.starts_at) }}–{{ formatTime(hosted.ends_at) }} · up to {{ hosted.capacity }}</span>
          </div>
          <ol class="mini-stops mb-3">
            <li v-for="s in hosted.stops" :key="s.seq"><b>{{ s.seq }}.</b> {{ s.name }} <span class="text-muted">{{ formatTime(s.arrive_iso) }}</span></li>
          </ol>
          <div class="who mb-3">
            <MemberAvatarStack :members="hosted.roster || []" :capacity="hosted.capacity" :size="34" :interactive="false" />
            <div class="small">
              <template v-if="guests.length">
                <div v-for="g in guests" :key="g.user_id"><b>{{ g.display_name }}</b> <span class="text-muted">· {{ rangeOf(g) }}</span></div>
              </template>
              <span v-else class="text-muted">Nobody has joined yet.</span>
            </div>
          </div>
          <p class="tiny text-muted"><i class="bi bi-arrow-repeat"></i> Edit your plan freely: this updates by itself. If you change a stop someone joined, they go back to their own plan and we'll tell you.</p>
          <div class="d-grid gap-2">
            <RouterLink :to="`/quests/${hosted.id}`" class="btn btn-primary" @click="emit('close')">View as guests see it</RouterLink>
            <button v-if="DEV_PANEL && hosted.status === 'open'" class="btn btn-sm btn-dark" :disabled="busy" @click="demoJoin">
              <i class="bi bi-robot"></i> Demo: a traveller joins
            </button>
            <button class="btn btn-outline-danger btn-sm" :disabled="busy" @click="closeWindow"><i class="bi bi-x-circle"></i> Close open quest</button>
          </div>
        </div>

        <!-- Open some stops -->
        <form v-else @submit.prevent="publish">
          <div v-if="!stops.length" class="alert alert-warning small mb-0">
            No upcoming stops to open (they need to start at least 15 min from now). Add a stop to your mission first.
          </div>
          <template v-else>
            <label class="form-label small fw-800 mb-1" for="otc-title">Name your quest</label>
            <input id="otc-title" v-model="title" class="form-control mb-3" maxlength="60" :placeholder="titleFallback" autocomplete="off" />

            <label class="form-label small fw-800 mb-1">Which stops can people join?</label>
            <StopRangePicker v-model="range" :stops="stops" inside-label="Open" outside-label="Private" class="mb-2" />
            <p class="tiny text-muted mb-3">
              <i class="bi bi-eye-slash"></i> Guests only see the open stops. Your other stops, your airport and your flight time stay private.
              The first open stop (<b>{{ picked[0]?.name }}</b>) is the meeting point.
            </p>

            <label class="form-label small fw-800 mb-1">Group size (including you)</label>
            <div class="btn-group w-100 mb-3" role="group" aria-label="Group size">
              <template v-for="n in [2, 3, 4]" :key="n">
                <input :id="'cap-' + n" v-model="capacity" type="radio" class="btn-check" :value="n" />
                <label class="btn btn-soft" :for="'cap-' + n">{{ n }}</label>
              </template>
            </div>

            <label class="form-label small fw-800 mb-1" for="otc-note">Note <span class="text-muted fw-normal">(optional)</span></label>
            <textarea id="otc-note" v-model="note" class="form-control mb-1" rows="2" maxlength="280"
              placeholder="e.g. Easy pace, lots of food. I'll wear a yellow cap."></textarea>
            <div class="tiny text-muted text-end mb-3">{{ note.length }}/280</div>

            <button class="btn btn-primary btn-lg w-100" :disabled="busy || !picked.length">
              <span v-if="busy" class="spinner-border spinner-border-sm"></span>
              <template v-else><i class="bi bi-people-fill"></i> Open {{ picked.length === 1 ? 'this stop' : `these ${picked.length} stops` }}</template>
            </button>
            <p class="tiny text-muted text-center mt-2 mb-0">People join instantly, up to {{ capacity }} including you.</p>
          </template>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop { position: fixed; inset: 0; z-index: 1800; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; }
.sheet {
  width: min(560px, 100%);
  max-height: 92vh;
  overflow-y: auto;
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom));
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  animation: sheet-up 0.2s ease-out;
}
@keyframes sheet-up { from { transform: translateY(40px); opacity: 0; } }
.grabber { width: 44px; height: 5px; border-radius: 99px; background: var(--zt-soft-line); margin: 0 auto 10px; }
.mini-stops { list-style: none; padding: 10px 12px; margin: 0; border-radius: 14px; background: var(--zt-yellow-pale); color: #111; display: grid; gap: 2px; font-size: 0.85rem; }
.mini-stops .text-muted { color: #555 !important; }
.who { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 14px; border: 2px dashed var(--zt-soft-line); }
</style>
