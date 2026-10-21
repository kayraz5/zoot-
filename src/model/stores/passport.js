import { defineStore } from 'pinia'
import { getDb } from '../services/db/index.js'

// Stamps, area chops and seen places (passport + Codex).
// Slammed chops and seen places are saved per user in passport_pages (localStorage for guests).

let loading = Promise.resolve()
let saving = Promise.resolve()

export const usePassportStore = defineStore('passport', {
  state: () => ({
    userId: null,
    stamps: [],
    slammed: new Set(),
    seen: new Set()
  }),

  getters: {
    stampedIds(state) {
      return new Set(state.stamps.map((stamp) => stamp.place_id))
    },

    byArea(state) {
      const groups = {}
      for (const stamp of state.stamps) {
        if (!stamp.area) continue
        if (!groups[stamp.area]) groups[stamp.area] = []
        groups[stamp.area].push(stamp)
      }
      return groups
    },

    // Areas with at least one stamp
    chopCount() {
      return Object.keys(this.byArea).length
    },

    // Chops earned but not yet slammed onto the passport, in the order they were first stamped
    pendingSlams() {
      return Object.keys(this.byArea).filter((area) => !this.slammed.has(area))
    }
  },

  actions: {
    // Called whenever the signed-in user changes (null on sign-out)
    load(userId) {
      loading = this.fetch(userId).catch((err) => console.warn('[passport] could not load:', err.message))
      return loading
    },

    whenLoaded() {
      return loading
    },

    async fetch(userId) {
      this.userId = userId || null
      this.stamps = []
      this.slammed = new Set()
      this.seen = new Set()
      if (!userId) return

      const db = await getDb()
      let pageFailed = false
      const [stamps, page] = await Promise.all([
        db.listStamps(userId),
        db.getPassportPage(userId).catch((err) => {
          pageFailed = true
          console.warn('[passport] could not load progress:', err.message)
          return null
        })
      ])
      if (this.userId !== userId) return // signed out or switched user while loading

      this.stamps = stamps
      this.seen = new Set([...(page?.seen_places || []), ...this.seen])
      if (page) {
        this.slammed = new Set(page.slammed_areas)
      } else {
        // No saved progress yet: chops already earned count as slammed, so they don't all replay
        this.slammed = new Set(Object.keys(this.byArea))
        if (!pageFailed) this.save()
      }
    },

    // Returns true for the first stamp in an area
    addStamp(stamp) {
      const firstInArea = Boolean(stamp.area) && !this.stamps.some((s) => s.area === stamp.area)
      this.stamps.push(stamp)
      this.markSeen([stamp.place_id])
      return firstInArea
    },

    consumeSlam(area) {
      this.slammed.add(area)
      this.save()
    },

    markSeen(placeIds) {
      const before = this.seen.size
      for (const id of placeIds) this.seen.add(id)
      if (this.seen.size > before) this.save()
    },

    // Saves run one at a time so an older save can't land last; progress stays in memory if one fails
    save() {
      const userId = this.userId
      if (!userId) return saving
      saving = saving.then(async () => {
        if (this.userId !== userId) return
        const db = await getDb()
        await db.savePassportPage(userId, { slammed_areas: [...this.slammed], seen_places: [...this.seen] })
      }).catch((err) => console.warn('[passport] could not save progress:', err.message))
      return saving
    }
  }
})
