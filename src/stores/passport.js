import { defineStore } from 'pinia'
import { getDb } from '../lib/db/index.js'

/** Stamps, chops and the Codex (Shrey: 3D passport · Kayra: stamps table). */
export const usePassportStore = defineStore('passport', {
  state: () => ({
    stamps: [],
    pendingSlams: read('zoot.pendingSlams', []),
    seen: new Set(read('zoot.seen', []))
  }),
  getters: {
    stampedIds: (s) => new Set(s.stamps.map((x) => x.place_id)),
    byArea: (s) => {
      const out = {}
      for (const st of s.stamps) (out[st.area] ||= []).push(st)
      return out
    },
    chopCount() { return Object.keys(this.byArea).length }
  },
  actions: {
    async load(userId) {
      if (!userId) return
      const db = await getDb()
      this.stamps = await db.listStamps(userId)
    },
    addStamp(stamp) {
      const firstInArea = !this.stamps.some((s) => s.area === stamp.area)
      this.stamps.push(stamp)
      this.markSeen([stamp.place_id])
      if (firstInArea && stamp.area) {
        this.pendingSlams.push(stamp.area)
        write('zoot.pendingSlams', this.pendingSlams)
      }
      return firstInArea
    },
    consumeSlam(area) {
      this.pendingSlams = this.pendingSlams.filter((a) => a !== area)
      write('zoot.pendingSlams', this.pendingSlams)
    },
    markSeen(ids) {
      ids.forEach((id) => this.seen.add(id))
      write('zoot.seen', [...this.seen])
    }
  }
})

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}
