import { defineStore } from 'pinia'
import { getDb } from '../services/db/index.js'

// Stamps, area chops, queued slam animations and seen places (passport + Codex).

const SLAMS_KEY = 'zoot.pendingSlams'
const SEEN_KEY = 'zoot.seen'

export const usePassportStore = defineStore('passport', {
  state: () => ({
    stamps: [],
    pendingSlams: loadFromStorage(SLAMS_KEY, []),
    seen: new Set(loadFromStorage(SEEN_KEY, []))
  }),

  getters: {
    stampedIds(state) {
      return new Set(state.stamps.map((stamp) => stamp.place_id))
    },

    byArea(state) {
      const groups = {}
      for (const stamp of state.stamps) {
        if (!groups[stamp.area]) groups[stamp.area] = []
        groups[stamp.area].push(stamp)
      }
      return groups
    },

    // Areas with at least one stamp
    chopCount() {
      return Object.keys(this.byArea).length
    }
  },

  actions: {
    async load(userId) {
      if (!userId) return
      const db = await getDb()
      this.stamps = await db.listStamps(userId)
    },

    // Returns true for the first stamp in an area
    addStamp(stamp) {
      const firstInArea = !this.stamps.some((s) => s.area === stamp.area)

      this.stamps.push(stamp)
      this.markSeen([stamp.place_id])

      if (firstInArea && stamp.area) {
        this.pendingSlams.push(stamp.area)
        saveToStorage(SLAMS_KEY, this.pendingSlams)
      }
      return firstInArea
    },

    consumeSlam(area) {
      this.pendingSlams = this.pendingSlams.filter((a) => a !== area)
      saveToStorage(SLAMS_KEY, this.pendingSlams)
    },

    markSeen(placeIds) {
      for (const id of placeIds) this.seen.add(id)
      saveToStorage(SEEN_KEY, [...this.seen])
    }
  }
})

// localStorage can throw (private mode, quota)
function loadFromStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}
