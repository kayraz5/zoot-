import { computed, watch } from 'vue'
import { useTripStore } from '../../../model/stores/trip.js'
import { useUserStore } from '../../../model/stores/user.js'
import { STYLES } from '../../../model/data/origins.js'
import { computeBudget } from '../../../model/services/planner.js'
import { now, tick } from '../../../model/services/clock.js'
import { TILES } from '../../../model/data/interests.js'

export { TILES }
/** What each travel style pre-picks until the traveller taps a tile. */
const STYLE_TILES = {
	budget: ['food', 'nature', 'views'],
	adventurous: ['nature', 'views', 'food'],
	party: ['nightlife', 'food', 'views'],
	conservative: ['culture', 'shopping', 'food']
}

export const WALKS = [10, 15, 20, 30]
export const FOOD = [
	{ id: 'none', label: 'None' },
	{ id: 'halal', label: 'Halal' },
	{ id: 'vegetarian', label: 'Vegetarian' },
	{ id: 'vegan', label: 'Vegan' }
]

/** The traveller's style id, falling back to budget. */
export function useStyleId() {
	const user = useUserStore()
	return computed(() => (STYLES[user.profile?.style] ? user.profile.style : 'budget'))
}

/**
 * Keep interests pre-picked from the travel style until the traveller taps a tile.
 * Called by the plan page (always mounted), so a style change on step 3 still re-picks.
 */
export function usePrePickedInterests() {
	const trip = useTripStore()
	const styleId = useStyleId()
	const prePick = () => {
		if (trip.draft.interestsTouched) return
		const picked = STYLE_TILES[styleId.value] || STYLE_TILES.budget
		trip.setInterests(TILES.filter((t) => picked.includes(t.id)).flatMap((t) => t.tags), { touched: false })
	}
	watch(styleId, prePick, { immediate: true })
}

/** 362 → "6H 02M" for big numbers, "6h 02m" for pills. */
export function hm(min, upper = true) {
	const m = Math.max(0, Math.round(min))
	const s = `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
	return upper ? s.toUpperCase() : s
}

const sgDate = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' })
/** "Tue 20 Oct" in Singapore time. */
export const sgDay = (ms) => sgDate.format(ms).replace(',', '')

/** Time budget for the current plan draft, shared by the plan page and its cards. */
export function usePlanTime() {
	const trip = useTripStore()
	const budget = computed(() => {
		tick.value // re-evaluate as the clock moves
		return computeBudget({ origin: trip.origin, startMs: trip.startMs, mustReturnMs: trip.mustReturnMs, cleared: trip.cleared })
	})
	return {
		budget,
		tooShort: computed(() => budget.value.usable_min < 60),
		bufferMin: computed(() => budget.value.reentry_min + budget.value.safety_min + budget.value.exit_min),
		/** Forecasts only reach a week ahead; rain checks kick in closer to the day. */
		beyondForecast: computed(() => (tick.value, trip.startMs - now() > 7 * 86400e3)),
		startInPast: computed(() => (tick.value, !trip.draft.startAtLanding && trip.startMs < now() - 60000))
	}
}
