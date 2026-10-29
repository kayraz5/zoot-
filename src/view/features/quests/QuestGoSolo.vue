<script setup>
import { ref } from 'vue'
import { useMissionStore } from '../../../model/stores/mission.js'
import { usePartyStore } from '../../../model/stores/party.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { useActiveQuest } from './useActiveQuest.js'

/** Small "Go solo" text link for the map card while I've joined someone's quest (nothing otherwise). */
const store = useMissionStore()
const party = usePartyStore()
const ui = useUiStore()
const { joined } = useActiveQuest()
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
</script>

<template>
  <button v-if="joined" type="button" class="go-solo" :disabled="busy" @click="goSolo">Go solo</button>
</template>

<style scoped>
.go-solo { padding: 0; border: 0; background: none; color: #a8a8a8; font-weight: 800; font-size: 0.85rem; text-decoration: underline; text-underline-offset: 3px; }
.go-solo:disabled { opacity: 0.5; }
</style>
