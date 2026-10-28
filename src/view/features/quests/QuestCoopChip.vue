<script setup>
import { useRouter } from 'vue-router'
import { usePartyStore } from '../../../model/stores/party.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { formatTime } from '../../../model/services/hours.js'
import { DEV_PANEL } from '../../../model/services/config.js'
import { useActiveQuest } from './useActiveQuest.js'

/**
 * One line at the top of the map card while I'm in a social quest:
 * "Meet Mei at Maxwell Food Centre, 13:30", then "With Mei until 15:40"; hosts see "Hosting Lina until 15:40".
 * Tapping it opens my plan. Chat and Go solo are QuestChatButton / QuestGoSolo lower in the card;
 * live locations and the automatic return are QuestMapLive.
 */
const party = usePartyStore()
const ui = useUiStore()
const router = useRouter()
const { joined, active, started, live, guestNames } = useActiveQuest()

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
  <div v-if="active" class="coop-chip" role="button" tabindex="0" aria-label="Open my plan"
    @click="router.push('/mission')" @keydown.enter="router.push('/mission')">
    <i class="bi bi-people-fill" aria-hidden="true"></i>
    <span class="coop-main flex-grow-1 min-w-0">
      <template v-if="active.role === 'host'">Hosting {{ guestNames.join(', ') }} until {{ formatTime(active.endMs) }}</template>
      <template v-else-if="started">With {{ joined.host_name }} until {{ formatTime(active.endMs) }}</template>
      <template v-else>Meet {{ joined.host_name }} at {{ joined.blocks[0].name }}, {{ formatTime(active.startMs) }}</template>
      <template v-if="party.liveOthers.length"> · {{ party.liveOthers.length }} live</template>
    </span>
    <button v-if="DEV_PANEL && live" type="button" class="coop-btn" title="Demo: put the others on the map" aria-label="Demo: put the others on the map" @click.stop="demoLocate"><i class="bi bi-robot"></i></button>
  </div>
</template>

<style scoped>
.coop-chip { cursor: pointer; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 10px; border-radius: 12px; background: var(--zt-pink); color: #111; border: 2px solid #111; }
.coop-main { font-weight: 800; font-size: 0.85rem; line-height: 1.25; }
.coop-btn { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 99px; border: 2px solid #111; background: #fff4c2; color: #111; font-size: 0.75rem; }
.min-w-0 { min-width: 0; }
</style>
