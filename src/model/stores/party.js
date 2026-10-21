import { acceptHMRUpdate, defineStore } from 'pinia'
import * as social from '../services/social.js'
import { useUiStore } from './ui.js'

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
    demoIds: new Set()
  }),
  actions: {
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
    async publish({ mission, stops, capacity, note }) {
      await social.publishWindow({ mission, stops, capacity, note })
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
