// EDITOR: Kayra

import { defineStore } from 'pinia'
import { ORIGINS } from '../data/origins.js'
import { getDb } from '../services/db/index.js'
import { now, tick } from '../services/clock.js'
import { toSgLocalInput, fromSgLocalInput } from '../services/hours.js'
import { useUserStore } from './user.js'

/** Will display: Over 24 h a connection counts as a stopover, not a layover. */
export const MAX_LAYOVER_H = 24
/** Feature: Layovers can be planned this far ahead (before the traveller has flown). */
export const MAX_AHEAD_DAYS = 365
/** Feature: Shorter than this, the airport buffers leave too little time to go out. */
export const MIN_LAYOVER_H = 5
/** Roughly: Arrival immigration + bags */
const EXIT_MIN = 30


/**
 * SCENARIO: Whether the traveller is already landside, so the planner can skip the exit buffer.
 * Worked out instead of asked: Jewel is landside, and anyone heading out at least 30 min
 * after landing has had time to clear immigration. (bcs GPS can't tell airside from landside.)
 */
export function isCleared(originId, arrivalMs, startMs) {
	return originId === 'jewel' || startMs - arrivalMs >= EXIT_MIN * 60000
}

/**
 * SCENARIO MESSAGES: Why an arrival/departure pair can't be planned
 */
export function layoverError(arrivalMs, departureMs, nowMs = now()) {
	if (!Number.isFinite(arrivalMs) || !Number.isFinite(departureMs)) 
		return 'Enter both times.'
	if (departureMs <= nowMs) 
		return 'That flight has already left.'
	if (departureMs <= arrivalMs) 
		return 'Your next flight has to leave after you land.'
	if (departureMs - arrivalMs < MIN_LAYOVER_H * 3600e3) 
		return `Layovers need at least ${MIN_LAYOVER_H} h to leave the airport safely.`
	if (departureMs - arrivalMs > MAX_LAYOVER_H * 3600e3) 
		return `Layovers are up to ${MAX_LAYOVER_H} h. Longer than that is a stopover.`
	if (arrivalMs - nowMs > MAX_AHEAD_DAYS * 86400e3) 
		return 'You can plan up to a year ahead.'
	return ''
}

//  PINIA STATE MANAGEMENT
// Planner form draft + saved trip rows (Kayra: form + trips table). */

export const useTripStore = defineStore('trip', {
	state: () => ({
		draft: defaultDraft(),
		current: null
	}),
	getters: {
		origin: (s) => ORIGINS.find((o) => o.id === s.draft.originId) || ORIGINS[0],
		arrivalMs: (s) => fromSgLocalInput(s.draft.arrivalLocal),
		/** The departure (gate) time: the planner's must-return time. */
		mustReturnMs: (s) => fromSgLocalInput(s.draft.mustReturnLocal),
		/**
		 * When the trip starts: at landing, or now if they've already landed. The "Heading out"
		 * override picks a later time instead
		 */
		startMs(s) {
			tick.value // re-evaluate as the clock moves
			if (!s.draft.startAtLanding) return fromSgLocalInput(s.draft.startLocal)
			return Math.max(this.arrivalMs, now())
		},
		layoverMin() {
			return Math.round((this.mustReturnMs - this.arrivalMs) / 60000)
		},
		landed() {
			return (tick.value, this.arrivalMs <= now())
		},
		/** Already through immigration (see isCleared). Replaces the old manual toggle. */
		cleared(s) {
			return isCleared(s.draft.originId, this.arrivalMs, this.startMs)
		}
	},
	actions: {
		/** Arrival + departure from the layover dialog. Returns '' or the reason it was refused. */
		setLayover(arrivalLocal, departureLocal) {
			const error = layoverError(fromSgLocalInput(arrivalLocal), fromSgLocalInput(departureLocal))
			if (error) return error
			this.draft.arrivalLocal = arrivalLocal
			this.draft.mustReturnLocal = departureLocal
			this.draft.layoverSet = true
			// An override outside the new layover no longer makes sense: go back to "at landing".
			if (!this.draft.startAtLanding && (this.startMs < this.arrivalMs || this.startMs >= this.mustReturnMs)) {
				this.draft.startAtLanding = true
			}
			return ''
		},
		/** "Heading out": at landing (default) or a later time inside the layover. */
		setStart(atLanding, startLocal = this.draft.startLocal) {
			this.draft.startAtLanding = atLanding
			if (atLanding) return
			const ms = fromSgLocalInput(startLocal)
			const earliest = Math.max(this.arrivalMs, now())
			this.draft.startLocal = toSgLocalInput(Math.min(this.mustReturnMs - 60 * 60000, Math.max(earliest, ms || earliest + 3600e3)))
		},
		/** Interests shown as pre-picked until the traveller changes them. */
		setInterests(ids, { touched = true } = {}) {
			this.draft.interests = [...new Set(ids)]
			if (touched) this.draft.interestsTouched = true
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
				foodNeeds: d.foodNeeds,
				cleared: this.cleared
			})
			return this.current
		}
	}
})

function roundTo5(ms) {
	return Math.ceil(ms / 300000) * 300000
}

function defaultDraft() {
	const landing = roundTo5(now() + 3600e3)
	return {
		originId: 'changi-t3',
		arrivalLocal: toSgLocalInput(landing),
		mustReturnLocal: toSgLocalInput(landing + 8 * 3600e3), // departure
		layoverSet: false, // the plan page asks for arrival + departure first
		startAtLanding: true,
		startLocal: toSgLocalInput(landing + 3600e3),
		interests: ['hawker', 'gardens', 'photo'],
		interestsTouched: false,
		energy: 'med',
		indoorPref: 'any',
		maxWalk: 15,
		partySize: 1,
		foodNeeds: 'none' // none | halal | vegetarian | vegan
	}
}
