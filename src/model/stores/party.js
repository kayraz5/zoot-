import { acceptHMRUpdate, defineStore } from 'pinia'
import { watch } from 'vue'
import * as social from '../services/social.js'
import { useUiStore } from './ui.js'
import { useUserStore } from './user.js'

const READ_KEY = 'zoot.chatRead' // { [partyId]: ms } when I last had that quest's chat open
let unwatchChat = null
let checkingCoop = false

/** Resolves once fn() is truthy. */
function until(fn) {
  return new Promise((resolve) => {
    if (fn()) return resolve()
    const stop = watch(fn, (v) => { if (v) { stop(); resolve() } })
  })
}
function readTimes() {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}') } catch { return {} }
}

/**
 * Social quests: the feed, one quest's detail, and the window I'm hosting.
 * Each list keeps its own { loading, error, guest } so views can show skeletons / retry buttons.
 */
export const usePartyStore = defineStore('party', {
  state: () => ({
    open: [],
    openStatus: { loading: false, error: null, guest: false },
    quest: null, // the quest on the detail page (+ roster, + my member row)
    questStatus: { loading: false, error: null, guest: false },
    hosted: null, // my open window for the active mission (+ roster), or null
    hostedFor: null, // mission id `hosted` was loaded for
    demoIds: new Set(),
    dialog: null, // centred prompt (CenterDialog.vue): { title, body, icon, confirmText, cancelText, tone, resolve }
    liveOthers: [], // other members' live positions on the map (QuestMapLive.vue keeps this up to date)
    liveRefresh: 0, // bump to make QuestMapLive re-read locations now (e.g. after the demo moved people)
    // Quest chat (QuestChatDrawer.vue). Started by whoever shows it or its unread badge.
    chat: { partyId: null, quest: null, messages: [], loading: false, error: null },
    chatUsers: 0, // how many screens are using the chat right now
    chatReadAt: readTimes()
  }),
  getters: {
    /** Messages from other people (not system lines) since I last had this chat open. */
    unread(s) {
      const me = useUserStore().userId
      const since = s.chatReadAt[s.chat.partyId] || 0
      return s.chat.messages.filter((m) => m.user_id && m.user_id !== me && Date.parse(m.created_at) > since).length
    },
    /** Sending closes 30 min after the window ends, or when the host closes it (the database enforces it too). */
    chatOpen(s) {
      const q = s.chat.quest
      return !!q && q.status !== 'closed' && Date.now() < Date.parse(q.ends_at) + 30 * 60000
    }
  },
  actions: {
    /** Centred prompt that blurs the page. Resolves true (confirm) or false (cancel). Waits its turn if one is showing. */
    async ask({ title, body = '', icon = 'bi-people-fill', confirmText = 'OK', cancelText = 'Cancel', tone = 'primary' }) {
      while (this.dialog) await until(() => !this.dialog)
      return new Promise((resolve) => {
        this.dialog = { title, body, icon, confirmText, cancelText, tone, resolve }
      })
    },
    /** Same, with a single acknowledge button. */
    notice({ confirmText = 'Got it', ...opts }) {
      return this.ask({ ...opts, confirmText, cancelText: null })
    },
    answer(value) {
      const d = this.dialog
      this.dialog = null
      d?.resolve(value)
    },

    // ── Chat ──
    /** Load a quest's chat and follow new messages. Pair every call with stopChat(). */
    async startChat(partyId) {
      this.chatUsers++
      if (this.chat.partyId === partyId) return
      this.resetChat()
      this.chat = { partyId, quest: null, messages: [], loading: true, error: null }
      try {
        const [quest, messages] = await Promise.all([social.getQuest(partyId), social.listMessages(partyId)])
        if (this.chat.partyId !== partyId) return
        this.chat.quest = quest
        this.chat.messages = messages
        unwatchChat = await social.watchMessages(partyId, (m) => this.addMessage(m))
      } catch (err) {
        if (this.chat.partyId === partyId) this.chat.error = err.message
      } finally {
        if (this.chat.partyId === partyId) this.chat.loading = false
      }
    },
    stopChat() {
      this.chatUsers = Math.max(0, this.chatUsers - 1)
      if (!this.chatUsers) this.resetChat()
    },
    resetChat() {
      unwatchChat?.()
      unwatchChat = null
      this.chat = { partyId: null, quest: null, messages: [], loading: false, error: null }
    },
    addMessage(m) {
      if (m.party_id !== this.chat.partyId || this.chat.messages.some((x) => x.id === m.id)) return
      this.chat.messages.push(m)
      // New people may join mid-quest: refresh names/avatars.
      if (m.user_id && !this.chat.quest?.roster?.some((r) => r.user_id === m.user_id)) {
        social.getQuest(m.party_id).then((q) => { if (q && this.chat.partyId === m.party_id) this.chat.quest = q }).catch(() => {})
      }
    },
    async sendChat(body, type = 'text') {
      if (!body.trim()) return
      this.addMessage(await social.sendMessage(this.chat.partyId, body, type))
      this.markChatRead()
    },
    markChatRead() {
      if (!this.chat.partyId) return
      this.chatReadAt = { ...this.chatReadAt, [this.chat.partyId]: Date.now() }
      try { localStorage.setItem(READ_KEY, JSON.stringify(this.chatReadAt)) } catch {}
    },
    /** Block someone: their messages disappear here at once; the database hides them everywhere from now on. */
    async block(userId) {
      await social.blockUser(userId)
      this.chat.messages = this.chat.messages.filter((m) => m.user_id !== userId)
      this.open = this.open.filter((q) => q.host_id !== userId)
    },

    // ── Co-op stamps ──
    /**
     * Show any co-op stamps I haven't seen ("You and Mei were both at Maxwell for the first time"),
     * after the stamp celebration closes, then refresh my XP. Called after stamping, when the map
     * opens, and when the database tells us a partner arrived after me.
     */
    async checkCoop() {
      if (checkingCoop) return
      checkingCoop = true
      try {
        let rows
        try { rows = await social.coopUnseen() } catch { return } // guest mode / offline
        if (!rows?.length) return
        const ui = useUiStore()
        await until(() => !ui.celebration)
        await social.markCoopSeen(rows.map((r) => r.id))
        const user = useUserStore()
        social.myProfile().then((p) => p && user.setProfile(p)).catch(() => {})
        for (const r of rows) {
          await this.notice({
            title: 'Co-op stamp!', icon: 'bi-people-fill', tone: 'success', confirmText: 'Nice!',
            body: `You and ${r.partners} were both at ${r.place_name} for the first time. +${r.bonus_xp} bonus XP each.`
          })
        }
      } finally {
        checkingCoop = false
      }
    },

    async run(statusKey, fn) {
      const status = this[statusKey]
      status.loading = true
      status.error = null
      status.guest = false
      try {
        return await fn()
      } catch (err) {
        status.guest = err instanceof social.GuestModeError
        status.error = err.message
        return null
      } finally {
        status.loading = false
      }
    },

    async loadOpen() {
      const rows = await this.run('openStatus', social.listOpenQuests)
      if (rows) this.open = rows
      this.loadDemoIds()
    },

    async loadQuest(id) {
      if (this.quest?.id !== id) this.quest = null
      const q = await this.run('questStatus', () => social.getQuest(id))
      if (q) this.quest = q
      else if (!this.questStatus.error) this.questStatus.error = 'This quest is no longer open.'
      this.loadDemoIds()
      return q
    },

    /** Throws (guest mode / network) so the host sheet can show why. */
    async loadHosted(mission) {
      this.hosted = mission ? await social.getHostedWindow(mission.id) : null
      this.hostedFor = mission?.id || null
      return this.hosted
    },

    async loadDemoIds() {
      try { this.demoIds = await social.demoUserIds() } catch { /* not signed in / guest */ }
    },

    // Mutations throw so the calling button can toast the database's own message.
    async publish({ mission, stops, capacity, note, title }) {
      await social.publishWindow({ mission, stops, capacity, note, title })
      await this.loadHosted(mission)
      this.loadOpen()
      return this.hosted
    },
    async closeWindow(id) {
      await social.closeWindow(id)
      if (this.hosted?.id === id) this.hosted = null
      this.open = this.open.filter((q) => q.id !== id)
    },
    async deleteQuest(id) {
      await social.deleteQuest(id)
      if (this.hosted?.id === id) this.hosted = null
      if (this.quest?.id === id) this.quest = null
      this.open = this.open.filter((q) => q.id !== id)
    },
    async simulate(questId, action) {
      const msg = await social.devSimulate(questId, action)
      if (this.quest?.id === questId) await this.loadQuest(questId)
      if (this.hosted?.id === questId) this.hosted = { ...this.hosted, ...(await social.getQuest(questId)) }
      return msg
    },

    /**
     * Called after my mission is saved (mission store persist). If I host a window for it and the
     * stops guests can see changed, push the new window. Guests whose joined stops changed are sent
     * back to their own plan by the database; tell the host who.
     */
    async syncHostedWindow(mission) {
      try {
        const hosted = this.hostedFor === mission.id ? this.hosted : await this.loadHosted(mission)
        if (!hosted) return
        const next = social.windowAfterEdit(hosted, mission)
        if (!next) return
        const ui = useUiStore()
        if (!next.length) {
          await social.closeWindow(hosted.id)
          this.hosted = null
          ui.toast('Your open stops are no longer in your plan, so the quest was closed.', 'warning', 5000)
          return
        }
        const res = await social.updateWindow(hosted.id, next)
        const names = (res.removed || []).map((id) => hosted.roster?.find((m) => m.user_id === id)?.display_name || 'A guest')
        if (names.length) ui.toast(`${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} back on their own plan (their stops changed).`, 'warning', 5000)
        await this.loadHosted(mission)
      } catch (err) {
        if (!(err instanceof social.GuestModeError)) useUiStore().toast(`Couldn't update your open quest: ${err.message}`, 'danger', 5000)
      }
    }
  }
})

// Dev only: when this file changes, update the live store (new actions included) instead of keeping the old one.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePartyStore, import.meta.hot))
