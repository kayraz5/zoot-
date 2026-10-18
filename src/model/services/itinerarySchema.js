/**
 * Hand-written validators for the two versioned JSON contracts.
 *
 *  zoot.choice.v1  — what Groq returns: which places + flavour copy. No minutes, no coordinates.
 *  zoot.mission.v1 — what the app stores and plays: legs timed by Turf + the MRT matrix.
 *
 * Both return { ok, errors[] }. The pipeline retries Groq once on an invalid
 * choice, then falls back to the deterministic planner.
 */

export const CHOICE_SCHEMA = 'zoot.choice.v1'
export const MISSION_SCHEMA = 'zoot.mission.v1'

const STYLES = ['budget', 'adventurous', 'party', 'conservative']
const MODES = ['walk', 'mrt', 'taxi']
const isStr = (v, max = 400) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * @param {unknown} c           Parsed Groq output
 * @param {Set<string>} allowed Place ids that were in the catalog slice sent to Groq
 */
export function validateChoice(c, allowed) {
	const errors = []
	if (!c || typeof c !== 'object') return { ok: false, errors: ['not an object'] }
	if (c.schema !== CHOICE_SCHEMA) errors.push(`schema must be "${CHOICE_SCHEMA}"`)
	if (!isStr(c.title, 80)) errors.push('title must be a string ≤ 80 chars')
	if (!Array.isArray(c.picks)) errors.push('picks must be an array')
	else {
		if (c.picks.length < 1 || c.picks.length > 6) errors.push('picks must have 1–6 items')
		const seen = new Set()
		c.picks.forEach((p, i) => {
			if (!p || typeof p !== 'object') return errors.push(`picks[${i}] not an object`)
			if (!allowed.has(p.place_id)) errors.push(`picks[${i}].place_id "${p.place_id}" is not in the catalog`)
			if (seen.has(p.place_id)) errors.push(`picks[${i}] duplicates ${p.place_id}`)
			seen.add(p.place_id)
			if (!isStr(p.why, 280)) errors.push(`picks[${i}].why must be a string ≤ 280 chars`)
			for (const banned of ['lat', 'lng', 'travel_min', 'arrive_iso']) {
				if (banned in p) errors.push(`picks[${i}] must not include ${banned} (the app owns geometry and time)`)
			}
		})
	}
	return { ok: errors.length === 0, errors }
}

/**
 * @param {object} m            Mission object
 * @param {Set<string>} placeIds Catalog ids
 */
export function validateMission(m, placeIds) {
	const errors = []
	if (!m || typeof m !== 'object') return { ok: false, errors: ['not an object'] }
	if (m.schema !== MISSION_SCHEMA) errors.push(`schema must be "${MISSION_SCHEMA}"`)
	if (!isStr(m.title, 120)) errors.push('title required')
	if (!STYLES.includes(m.style)) errors.push(`style must be one of ${STYLES.join('|')}`)
	if (!isNum(m.total_out_min) || m.total_out_min < 0) errors.push('total_out_min must be ≥ 0')
	if (!isNum(m.buffer_min)) errors.push('buffer_min must be a number')
	if (!isIso(m.must_return_iso)) errors.push('must_return_iso must be ISO')
	if (!Array.isArray(m.legs) || m.legs.length < 2) {
		errors.push('legs must include at least one visit and the return leg')
		return { ok: false, errors }
	}
	let prevDepart = -Infinity
	m.legs.forEach((l, i) => {
		const at = `legs[${i}]`
		const isReturn = i === m.legs.length - 1
		if (isReturn !== (l.kind === 'return')) errors.push(`${at}.kind: only the last leg may be (and must be) "return"`)
		if (!isReturn && !placeIds.has(l.place_id)) errors.push(`${at}.place_id "${l.place_id}" not in catalog`)
		if (!MODES.includes(l.travel_mode)) errors.push(`${at}.travel_mode invalid`)
		if (!isNum(l.travel_min) || l.travel_min < 0) errors.push(`${at}.travel_min invalid`)
		if (!isNum(l.stay_min) || l.stay_min < 0) errors.push(`${at}.stay_min invalid`)
		if (!isNum(l.xp) || l.xp < 0) errors.push(`${at}.xp invalid`)
		if (!isStr(l.why, 400)) errors.push(`${at}.why required`)
		if (!isIso(l.arrive_iso) || !isIso(l.depart_iso)) errors.push(`${at} times must be ISO`)
		else {
			const a = Date.parse(l.arrive_iso)
			const d = Date.parse(l.depart_iso)
			if (d < a) errors.push(`${at} departs before it arrives`)
			if (l.status === 'pending' && a < prevDepart) errors.push(`${at} overlaps the previous leg`)
			prevDepart = d
		}
	})
	const ret = m.legs.at(-1)
	if (ret.kind === 'return') {
		if (!isIso(ret.arrive_by)) errors.push('return leg needs arrive_by')
		else if (Date.parse(ret.arrive_iso) > Date.parse(ret.arrive_by)) errors.push('return leg arrives after arrive_by — plan breaks the clock')
	}
	return { ok: errors.length === 0, errors }
}