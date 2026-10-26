<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMissionStore } from '../../model/stores/mission.js'
import { usePartyStore } from '../../model/stores/party.js'
import { useUiStore } from '../../model/stores/ui.js'
import { formatTime } from '../../model/services/hours.js'
import { DEV_PANEL } from '../../model/services/config.js'
import { useActiveQuest } from '../composables/useActiveQuest.js'
import QuestChatDrawer from './QuestChatDrawer.vue'

/**
 * Map chip for a social quest: "With Mei until 15:40 · Your plan resumes: Gardens", Go solo.
 * Hosts with guests see "Hosting Lina until …". Tapping it opens my plan; 💬 opens the quest chat.
 * Display only: live locations and the automatic return when my stops end are handled by
 * QuestMapLive, which stays on even when the card holding this chip is closed.
 */
const store = useMissionStore()
const party = usePartyStore()
const ui = useUiStore()
const router = useRouter()
const { joined, active, started, live, guestNames, resume } = useActiveQuest()

const busy = ref(false)
const chatOpen = ref(false)
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
    party.liveRefresh++
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
        <div class="coop-main">
          <template v-if="started">With {{ joined.host_name }} until {{ formatTime(active.endMs) }}</template>
          <template v-else>Meet {{ joined.host_name }} at {{ joined.blocks[0].name }}, {{ formatTime(active.startMs) }}</template>
        </div>
        <div class="coop-sub">
          <template v-if="resume?.kind === 'visit'">Your plan resumes: {{ resume.name }}</template>
          <template v-else>Then head back to {{ store.mission.origin.label }}</template>
          <template v-if="party.liveOthers.length"> · {{ party.liveOthers.length }} live</template>
        </div>
      </template>
      <template v-else>
        <div class="coop-main">Hosting {{ guestNames.join(', ') }} until {{ formatTime(active.endMs) }}</div>
        <div class="coop-sub">{{ party.liveOthers.length ? `${party.liveOthers.length} on the map` : 'Locations show 30 min before you meet' }}</div>
      </template>
    </div>
    <div class="d-flex gap-1 flex-none">
      <button type="button" class="coop-btn chat" :aria-label="party.unread ? `Chat, ${party.unread} unread` : 'Chat'" title="Chat" @click.stop="chatOpen = true">
        <i class="bi bi-chat-dots-fill"></i>
        <span v-if="party.unread" class="badge-dot">{{ party.unread > 9 ? '9+' : party.unread }}</span>
      </button>
      <button v-if="DEV_PANEL && live" type="button" class="coop-btn" title="Demo: put the others on the map" aria-label="Demo: put the others on the map" @click.stop="demoLocate"><i class="bi bi-robot"></i></button>
      <button v-if="active.role === 'guest'" type="button" class="coop-btn solo" :disabled="busy" @click.stop="goSolo">Go solo</button>
    </div>
    <QuestChatDrawer :open="chatOpen" :party-id="active.id" @close="chatOpen = false" />
  </div>
</template>

<style scoped>
.coop-chip { cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 8px 10px; border-radius: 16px; background: var(--zt-pink); color: #111; border: 3px solid #111; }
.coop-icon { font-size: 1.2rem; }
.coop-main { font-weight: 800; font-size: 0.9rem; line-height: 1.2; }
.coop-sub { font-size: 0.75rem; font-weight: 600; opacity: 0.85; }
.coop-btn { display: inline-grid; place-items: center; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 99px; border: 2px solid #111; background: #fff4c2; color: #111; font-weight: 800; font-size: 0.75rem; text-decoration: none; }
.coop-btn.solo { background: #111; color: #ffcc00; }
.coop-btn.chat { position: relative; }
.badge-dot { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: #111; color: #ffcc00; font-size: 0.65rem; line-height: 18px; text-align: center; }
.coop-btn:disabled { opacity: 0.6; }
.min-w-0 { min-width: 0; }
.flex-none { flex: none; }
</style>
