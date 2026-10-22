import { defineStore } from 'pinia'
import { getDb } from '../services/db/index.js'

// Stamps, area chops and seen places (passport + Codex). An area's chop is earned at CHOP_TARGET places.
// Slammed chops and seen places are saved per user in passport_pages (localStorage for guests).

// Different places to stamp in an area to earn its chop
export const CHOP_TARGET = 6

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

    // First stamp of each place, grouped by area, oldest first (a place stamped again another day counts once)
    byArea(state) {
      const groups = {}
      const counted = new Set()
      for (const stamp of [...state.stamps].sort((a, b) => String(a.stamped_at).localeCompare(String(b.stamped_at)))) {
        if (!stamp.area || counted.has(stamp.place_id)) continue
        counted.add(stamp.place_id)
        if (!groups[stamp.area]) groups[stamp.area] = []
        groups[stamp.area].push(stamp)
      }
      return groups
    },

    // Areas with CHOP_TARGET different places stamped, in the order they were earned
    choppedAreas() {
      return Object.entries(this.byArea)
        .filter(([, stamps]) => stamps.length >= CHOP_TARGET)
        .sort(([, a], [, b]) => String(a[CHOP_TARGET - 1].stamped_at).localeCompare(String(b[CHOP_TARGET - 1].stamped_at)))
        .map(([area]) => area)
    },

    chopCount() {
      return this.choppedAreas.length
    },

    // Chops earned but not yet slammed onto the passport
    pendingSlams() {
      return this.choppedAreas.filter((area) => !this.slammed.has(area))
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
      // Stamped places count as seen too (stamps from before seen was saved never got added)
      this.seen = new Set([...(page?.seen_places || []), ...this.seen, ...this.stampedIds])
      if (page) {
        // Drop areas whose chop isn't earned (e.g. slammed under the old one-stamp rule), so they slam at 6
        const chopped = new Set(this.choppedAreas)
        this.slammed = new Set(page.slammed_areas.filter((area) => chopped.has(area)))
        const changed = this.slammed.size !== page.slammed_areas.length || this.seen.size !== (page.seen_places || []).length
        if (changed) this.save()
      } else {
        // No saved progress yet: chops already earned count as slammed, so they don't all replay
        this.slammed = new Set(this.choppedAreas)
        if (!pageFailed) this.save()
      }
    },

    // Returns true when this stamp earns its area's chop
    addStamp(stamp) {
      const before = this.byArea[stamp.area]?.length || 0
      this.stamps.push(stamp)
      this.markSeen([stamp.place_id])
      const after = this.byArea[stamp.area]?.length || 0
      return before < CHOP_TARGET && after >= CHOP_TARGET
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
