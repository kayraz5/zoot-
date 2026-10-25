import { defineStore } from 'pinia'

/**
 * The look of your 3D traveller: outfit, fur, hat and eyewear.
 *
 * Hat and eyewear are stored separately from the outfit on purpose — they're
 * independent picks, so any hat goes with any kit.
 *
 * Deliberately dumb — it stores two strings and nothing else. In particular it
 * does NOT import travellerAssets.js to validate them: that file pulls in all
 * of Three.js, and this store is loaded on every page, so importing it here
 * would drop ~540 kB of 3D engine into the bundle for people who are only
 * looking at their passport. The 3D side already falls back to the default kit
 * for a name it doesn't recognise (see getOutfit/getFur), so a stale saved
 * value from an outfit you later rename can't break anything.
 *
 * Saved per-device in localStorage rather than on the user profile, so it works
 * in guest mode and needs no database column. Same approach as the theme and
 * forceRain flags in ui.js.
 */

const KEY = 'zoot.character'
const DEFAULTS = { outfit: 'zoot', fur: 'zoot', hat: 'cap', eyewear: 'none' }

export const useCharacterStore = defineStore('character', {
  state: () => ({
    // What the map is actually showing.
    ...read(),
    // Bumped on every save. The map watches this so it can tell "the user saved
    // the same outfit again" from "nothing happened" — handy for the toast.
    savedAt: 0
  }),

  actions: {
    /** Commit a look and remember it for next time. */
    save({ outfit, fur, hat, eyewear }) {
      if (outfit) this.outfit = outfit
      if (fur) this.fur = fur
      if (hat) this.hat = hat
      if (eyewear) this.eyewear = eyewear
      this.savedAt = Date.now()
      try {
        const { outfit: o, fur: f, hat: h, eyewear: e } = this
        localStorage.setItem(KEY, JSON.stringify({ outfit: o, fur: f, hat: h, eyewear: e }))
      } catch {
        // Private browsing / storage full: the look still applies for this
        // session, it just won't survive a reload. Not worth interrupting for.
      }
    },

    /** Back to the house look. */
    reset() {
      this.save({ ...DEFAULTS })
    }
  }
})

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    const pick = (k) => (typeof saved[k] === 'string' ? saved[k] : DEFAULTS[k])
    return { outfit: pick('outfit'), fur: pick('fur'), hat: pick('hat'), eyewear: pick('eyewear') }
  } catch {
    return { ...DEFAULTS }
  }
}
