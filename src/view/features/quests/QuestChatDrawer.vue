<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { usePartyStore } from '../../../model/stores/party.js'
import { useUserStore } from '../../../model/stores/user.js'
import { useUiStore } from '../../../model/stores/ui.js'
import { useMissionStore } from '../../../model/stores/mission.js'
import { QUICK_REPLIES, MESSAGE_MAX, REPORT_REASONS, reportUser } from '../../../model/services/social.js'
import { formatTime } from '../../../model/services/hours.js'
import { DEV_PANEL } from '../../../model/services/config.js'
import UserAvatar from '../../common/UserAvatar.vue'
import ProfilePreviewModal from '../../common/ProfilePreviewModal.vue'

/**
 * A quest's chat as a bottom drawer: messages, quick-reply chips, system lines
 * ("Mei checked in at Maxwell"), and Report / Block from a person's profile.
 * Members only (the database enforces it). Opened from the map chip and the quest page.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  partyId: { type: String, required: true }
})
const emit = defineEmits(['close'])

const party = usePartyStore()
const user = useUserStore()
const ui = useUiStore()
const mission = useMissionStore()

const draft = ref('')
const sending = ref(false)
const list = ref(null)
const profile = ref(null) // whose profile preview is open
const reporting = ref(false)
const reportReason = ref('harassment')
const reportDetails = ref('')

// The drawer uses the shared chat while it's open (the badge's owner may already have started it).
watch(() => props.open, async (isOpen, wasOpen) => {
  if (isOpen) {
    await party.startChat(props.partyId)
    party.markChatRead()
    scrollDown()
  } else if (wasOpen) {
    party.stopChat()
  }
}, { immediate: true })
onUnmounted(() => { if (props.open) party.stopChat() }) // removed while open (e.g. I went solo)

const messages = computed(() => (party.chat.partyId === props.partyId ? party.chat.messages : []))
const roster = computed(() => party.chat.quest?.roster || [])
const personOf = (userId) => roster.value.find((r) => r.user_id === userId) || { user_id: userId, display_name: 'Traveller' }
const mine = (m) => m.user_id === user.userId
/** Show the avatar + name only on the first of several messages in a row from the same person. */
const firstOfRun = (i) => i === 0 || messages.value[i - 1].user_id !== messages.value[i].user_id || messages.value[i - 1].type === 'system'

watch(() => messages.value.length, () => {
  if (!props.open) return
  party.markChatRead()
  scrollDown()
})
async function scrollDown() {
  await nextTick()
  if (list.value) list.value.scrollTop = list.value.scrollHeight
}

async function send(body, type = 'text') {
  if (!body.trim() || sending.value) return
  sending.value = true
  try {
    await party.sendChat(body, type)
    if (type === 'text') draft.value = ''
  } catch (err) {
    ui.toast(err.message, 'danger', 5000)
  } finally {
    sending.value = false
  }
}
async function demoReply() {
  try { await party.simulate(props.partyId, 'chat') } catch (err) { ui.toast(err.message, 'danger', 5000) }
}

// ── Report / Block from someone's profile ──
function showProfile(userId) {
  if (userId === user.userId) return
  reporting.value = false
  profile.value = personOf(userId)
}
async function sendReport() {
  try {
    await reportUser({ userId: profile.value.user_id, partyId: props.partyId, reason: reportReason.value, details: reportDetails.value })
    ui.toast(`Thanks. We'll look into it. ${profile.value.display_name} isn't told who reported them.`, 'success', 5000)
    profile.value = null
    reportDetails.value = ''
  } catch (err) {
    ui.toast(err.message, 'danger', 5000)
  }
}
async function block() {
  const who = profile.value
  const isHost = who.role === 'host' && mission.joinedQuest?.id === props.partyId
  profile.value = null
  const ok = await party.ask({
    title: `Block ${who.display_name}?`, icon: 'bi-slash-circle', tone: 'danger', confirmText: 'Block', cancelText: 'Cancel',
    body: isHost
      ? `You won't see each other's messages, location or quests again. Since they're hosting, you'll also leave this quest and go back to your own plan.`
      : `You won't see each other's messages, location or quests again.`
  })
  if (!ok) return
  try {
    await party.block(who.user_id)
    if (isHost) {
      await mission.leaveQuest(props.partyId)
      emit('close')
    }
    ui.toast(`${who.display_name} is blocked.`, 'success')
  } catch (err) {
    ui.toast(err.message, 'danger', 5000)
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="chat-backdrop" @click.self="emit('close')">
      <section class="chat-sheet zt-card" role="dialog" aria-modal="true" aria-labelledby="chat-title">
        <div class="grabber" aria-hidden="true"></div>
        <header class="d-flex align-items-center gap-2 mb-2">
          <div class="flex-grow-1 min-w-0">
            <h2 id="chat-title" class="h5 mb-0 text-truncate">{{ party.chat.quest?.title || 'Quest chat' }}</h2>
            <div class="tiny text-muted text-truncate">{{ roster.map((r) => r.display_name).join(', ') }}</div>
          </div>
          <button v-if="DEV_PANEL && party.chatOpen" type="button" class="btn btn-sm btn-soft" title="Demo: someone replies" aria-label="Demo: someone replies" @click="demoReply"><i class="bi bi-robot"></i></button>
          <button type="button" class="btn btn-sm btn-soft" aria-label="Close chat" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
        </header>

        <div ref="list" class="chat-list" aria-live="polite">
          <div v-if="party.chat.loading && !messages.length" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"><span class="visually-hidden">Loading…</span></div></div>
          <p v-else-if="party.chat.error" class="small text-danger text-center py-3">{{ party.chat.error }}</p>
          <p v-else-if="!messages.length" class="small text-muted text-center py-4">Say hi! Only people in this quest can read this.</p>

          <template v-for="(m, i) in messages" :key="m.id">
            <div v-if="m.type === 'system'" class="sys" :class="{ coop: m.meta?.kind === 'coop' }">{{ m.body }}</div>
            <div v-else class="msg" :class="{ me: mine(m), first: firstOfRun(i) }">
              <button v-if="!mine(m) && firstOfRun(i)" type="button" class="who" :aria-label="`${personOf(m.user_id).display_name}'s profile`" @click="showProfile(m.user_id)">
                <UserAvatar :profile="personOf(m.user_id)" :size="30" />
              </button>
              <span v-else-if="!mine(m)" class="who-space"></span>
              <div class="bubble-wrap">
                <div v-if="!mine(m) && firstOfRun(i)" class="tiny fw-800 name">{{ personOf(m.user_id).display_name }}</div>
                <div class="bubble" :class="{ chip: m.type === 'chip' }">{{ m.body }}</div>
                <div class="tiny text-muted time">{{ formatTime(m.created_at) }}</div>
              </div>
            </div>
          </template>
        </div>

        <footer v-if="party.chatOpen" class="pt-2">
          <div class="chips mb-2" role="group" aria-label="Quick replies">
            <button v-for="c in QUICK_REPLIES" :key="c" type="button" class="zt-chip" :disabled="sending" @click="send(c, 'chip')">{{ c }}</button>
          </div>
          <form class="d-flex gap-2" @submit.prevent="send(draft)">
            <input v-model="draft" class="form-control" :maxlength="MESSAGE_MAX" placeholder="Message" aria-label="Message" autocomplete="off" enterkeyhint="send" />
            <button class="btn btn-primary" :disabled="sending || !draft.trim()" aria-label="Send"><i class="bi bi-send-fill"></i></button>
          </form>
        </footer>
        <p v-else-if="party.chat.quest" class="small text-muted text-center mb-0 pt-2"><i class="bi bi-lock"></i> This quest has ended, so the chat is read-only.</p>
      </section>
    </div>

    <ProfilePreviewModal :profile="profile" @close="profile = null">
      <template #actions>
        <div v-if="!reporting" class="d-flex gap-2 w-100">
          <button type="button" class="btn btn-soft flex-grow-1" @click="reporting = true"><i class="bi bi-flag"></i> Report</button>
          <button type="button" class="btn btn-outline-danger flex-grow-1" @click="block"><i class="bi bi-slash-circle"></i> Block</button>
        </div>
        <form v-else class="w-100 text-start" @submit.prevent="sendReport">
          <div class="small fw-800 mb-2">What's wrong?</div>
          <div class="d-flex flex-wrap gap-2 mb-2" role="radiogroup" aria-label="Reason">
            <button v-for="r in REPORT_REASONS" :key="r.id" type="button" class="zt-chip" :class="{ active: reportReason === r.id }"
              role="radio" :aria-checked="reportReason === r.id" @click="reportReason = r.id">{{ r.label }}</button>
          </div>
          <textarea v-model="reportDetails" class="form-control mb-2" rows="2" maxlength="500" placeholder="Anything else we should know? (optional)"></textarea>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-soft" @click="reporting = false">Back</button>
            <button class="btn btn-danger flex-grow-1">Send report</button>
          </div>
        </form>
      </template>
    </ProfilePreviewModal>
  </Teleport>
</template>

<style scoped>
.chat-backdrop { position: fixed; inset: 0; z-index: 1800; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; }
.chat-sheet {
  width: min(560px, 100%);
  height: min(78vh, 680px);
  display: flex;
  flex-direction: column;
  padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  animation: sheet-up 0.2s ease-out;
}
@keyframes sheet-up { from { transform: translateY(40px); opacity: 0; } }
.grabber { width: 44px; height: 5px; border-radius: 99px; background: var(--zt-soft-line); margin: 0 auto 10px; flex: none; }
.chat-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding: 4px 2px 8px; overscroll-behavior: contain; }
.sys { align-self: center; max-width: 90%; margin: 6px 0; padding: 3px 10px; border-radius: 99px; background: var(--zt-soft-line); color: var(--zt-muted); font-size: 0.75rem; text-align: center; }
.sys.coop { background: var(--zt-yellow); color: #111; font-weight: 800; }
.msg { display: flex; gap: 8px; align-items: flex-end; max-width: 85%; }
.msg.first { margin-top: 6px; }
.msg.me { align-self: flex-end; flex-direction: row-reverse; }
.who { padding: 0; border: 0; background: none; flex: none; align-self: flex-start; margin-top: 16px; }
.who-space { width: 30px; flex: none; }
.bubble-wrap { min-width: 0; display: flex; flex-direction: column; }
.msg.me .bubble-wrap { align-items: flex-end; }
.name { margin: 0 0 2px 4px; }
.bubble { padding: 7px 12px; border-radius: 16px 16px 16px 4px; background: var(--zt-card); border: 2px solid var(--zt-line); overflow-wrap: anywhere; white-space: pre-wrap; }
.msg.me .bubble { border-radius: 16px 16px 4px 16px; background: var(--zt-pink); color: #111; }
.bubble.chip { font-weight: 800; }
.time { margin: 1px 6px 0; font-size: 0.65rem; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips .zt-chip { font-size: 0.75rem; padding: 4px 10px; }
.min-w-0 { min-width: 0; }
</style>
