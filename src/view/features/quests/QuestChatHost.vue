<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { usePartyStore } from '../../../model/stores/party.js'
import { useMissionStore } from '../../../model/stores/mission.js'
import { useUserStore } from '../../../model/stores/user.js'
import { notify } from '../../../model/services/notify.js'
import { useActiveQuest } from './useActiveQuest.js'
import QuestChatDrawer from './QuestChatDrawer.vue'

/**
 * Quest chat for the whole app (mounted once in App.vue):
 *  - follows the chat of the quest I'm in, on every page, so new messages are never missed;
 *  - shows a banner ("💬 Mei: Running 5 min late") when someone writes and the chat isn't open,
 *    and a phone notification when the app is in the background;
 *  - holds the one chat drawer. Anything can open it with party.openChat(partyId).
 */
const party = usePartyStore()
const mission = useMissionStore()
const user = useUserStore()
const { active } = useActiveQuest()

// Signed in: load my plan (for the quest I joined) and my open window (if I'm hosting one).
watch(() => user.userId, async (id) => {
  if (!id) return
  try {
    const m = await mission.loadActive()
    if (m) await party.loadHosted(m)
  } catch { /* guest mode / offline: no social quests */ }
}, { immediate: true })

// Follow the active quest's chat.
let following = null
function follow(id) {
  if (following) party.stopChat()
  following = id || null
  if (following) party.startChat(following)
}
watch(() => active.value?.id, follow, { immediate: true })
onUnmounted(() => follow(null))
// After reading another quest's chat (e.g. from its page), switch back to mine.
watch(() => party.chatPanel, (open) => {
  if (!open && following && party.chat.partyId !== following) {
    party.resetChat()
    party.chatUsers = 0
    party.startChat(following)
  }
})

// ── New message from someone else ──
const banner = ref(null)
let hideTimer = 0
watch(() => party.incoming, (msg) => {
  if (!msg) return
  if (document.hidden) {
    notify(`${msg.name} · ${msg.title}`, msg.body, { tag: `chat-${msg.partyId}`, onClick: () => party.openChat(msg.partyId) })
  }
  banner.value = msg
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { banner.value = null }, 6000)
})
onUnmounted(() => clearTimeout(hideTimer))
function openFromBanner() {
  const id = banner.value.partyId
  banner.value = null
  party.openChat(id)
}
</script>

<template>
  <Transition name="chat-banner">
    <button v-if="banner && party.chatPanel !== banner.partyId" type="button" class="chat-banner" @click="openFromBanner"
      :aria-label="`New message from ${banner.name}: ${banner.body}. Open chat`">
      <i class="bi bi-chat-dots-fill icon" aria-hidden="true"></i>
      <span class="flex-grow-1 min-w-0 text-start">
        <span class="d-block tiny fw-800 text-truncate">{{ banner.name }} · {{ banner.title }}</span>
        <span class="d-block small text-truncate">{{ banner.body }}</span>
      </span>
      <span class="open tiny fw-800">Open</span>
    </button>
  </Transition>

  <QuestChatDrawer v-if="party.chatPanel" :open="true" :party-id="party.chatPanel" @close="party.closeChat()" />
</template>

<style scoped>
.chat-banner {
  position: fixed;
  top: calc(10px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1700;
  width: min(520px, calc(100% - 32px));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 18px;
  border: 3px solid #111;
  background: var(--zt-pink);
  color: #111;
  box-shadow: 4px 4px 0 #111;
}
.icon { font-size: 1.3rem; }
.open { flex: none; padding: 3px 10px; border-radius: 99px; background: #111; color: #ffcc00; }
.min-w-0 { min-width: 0; }
.chat-banner-enter-active, .chat-banner-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.chat-banner-enter-from, .chat-banner-leave-to { transform: translate(-50%, -24px); opacity: 0; }
</style>
