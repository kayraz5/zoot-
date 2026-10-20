import { defineStore } from 'pinia'
import { ORIGINS } from '../data/origins.js'
import { getDb } from '../services/db/index.js'
import { now, tick } from '../services/clock.js'
import { toSgLocalInput, fromSgLocalInput } from '../services/hours.js'
import { useUserStore } from './user.js'

/** Over 24 h a connection counts as a stopover, not a layover. */
export const MAX_LAYOVER_H = 24

/** Planner form draft + saved trip rows (Kayra: form + trips table). */
export const useTripStore = defineStore('trip', {
	state: () => ({
		draft: defaultDraft(),
		current: null
	}),
	getters: {
		origin: (s) => ORIGINS.find((o) => o.id === s.draft.originId) || ORIGINS[0],
		/** "Now" follows the app clock; "later" is the SGT time picked in the form. */
		startMs: (s) => (tick.value, s.draft.startNow ? now() : fromSgLocalInput(s.draft.startLocal)),
		mustReturnMs: (s) => fromSgLocalInput(s.draft.mustReturnLocal)
	},
	actions: {
		setHours(h) {
			this.draft.hours = h
			this.draft.mustReturnLocal = toSgLocalInput(roundTo5(this.startMs + h * 3600e3))
		},
		/** Switch between leaving now and a later start; the layover length is kept. */
		setStart(startNow, startLocal = this.draft.startLocal) {
			this.draft.startNow = startNow
			this.draft.startLocal = startLocal
			this.setHours(this.draft.hours)
		},
		/** Typed return time → hours. Returns false when it was over the layover cap and got clamped. */
		syncHoursFromReturn() {
			const h = Math.max(1, Math.round(((this.mustReturnMs - this.startMs) / 3600e3) * 2) / 2)
			if (h > MAX_LAYOVER_H) {
				this.setHours(MAX_LAYOVER_H)
				return false
			}
			this.draft.hours = h
			return true
		},
		async saveTrip() {
			const user = useUserStore()
			const db = await getDb()
			const d = this.draft
			this.current = await db.saveTrip({
				user_id: user.userId,
				origin: { ...this.origin },
				start_at: new Date(this.startMs).toISOString(),
				must_return_at: new Date(this.mustReturnMs).toISOString(),
				style: user.profile?.style || 'budget',
				interests: [...d.interests],
				energy: d.energy,
				indoorPref: d.indoorPref,
				maxWalk: d.maxWalk,
				partySize: d.partySize,
				cleared: d.cleared
			})
			return this.current
		}
	}
})

function roundTo5(ms) {
	return Math.ceil(ms / 300000) * 300000
}

function defaultDraft() {
	return {
		originId: 'changi-t3',
		startNow: true,
		startLocal: toSgLocalInput(roundTo5(now() + 3600e3)),
		hours: 8,
		mustReturnLocal: toSgLocalInput(roundTo5(now() + 8 * 3600e3)),
		interests: ['hawker', 'gardens', 'photo'],
		energy: 'med',
		indoorPref: 'any',
		maxWalk: 18,
		partySize: 1,
		cleared: false
	}
}