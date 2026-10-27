<script setup>
import { computed } from 'vue'
import { usePartyStore } from '../../model/stores/party.js'
import { useActiveQuest } from '../composables/useActiveQuest.js'

/**
 * The map card's main button while I'm in a social quest: "💬 Chat with Mei" (+ unread count).
 * Renders nothing outside a quest. Opens the app-wide chat drawer (QuestChatHost).
 */
const party = usePartyStore()
const { active, joined, guestNames } = useActiveQuest()
const who = computed(() => (active.value?.role === 'guest' ? joined.value.host_name : guestNames.value.join(', ')))
</script>

<template>
  <button v-if="active" type="button" class="quest-chat-btn" :aria-label="party.unread ? `Chat with ${who}, ${party.unread} unread` : `Chat with ${who}`"
    @click="party.openChat(active.id)">
    <i class="bi bi-chat-dots-fill" aria-hidden="true"></i>
    <span class="text-truncate">Chat with {{ who }}</span>
    <span v-if="party.unread" class="unread">{{ party.unread > 9 ? '9+' : party.unread }}</span>
  </button>
</template>

<style scoped>
.quest-chat-btn {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 16px;
  border: 2px solid #111;
  background: var(--zt-yellow);
  color: #111;
  font-weight: 800;
  font-size: 1rem;
  box-shadow: 0 4px 0 #8a6d00;
}
.quest-chat-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #8a6d00; }
.unread { flex: none; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 99px; background: var(--zt-pink); color: #111; font-size: 0.75rem; line-height: 22px; }
</style>
