import { travel, distanceM, nearestHub } from './travel.js'
import { isOpenDuringVisit, formatTime } from './hours.js'

/**
 * Deterministic layover planner (Kayra + Hulbert lanes).
 *
 * The clock is the product: every plan must return the traveller to their
 * origin by arrive_by = must_return − re-entry − safety. If it cannot, we refuse.
 * Groq may choose places (see groq.js), but minutes always come from here.
 */

export const MISSION_SCHEMA = 'zoot.mission.v1'
const MIN = 60000
const CLUSTER_RADIUS_M = 1200
const ZIGZAG_LIMIT_M = 2500
export const RAIN_LIMIT = 60

/** Buffers shown in the UI so Sonion can see why the plan is shorter than his layover. */
export function computeBudget({ origin, startMs, mustReturnMs, cleared = false }) {
	const airport = origin.kind === 'airport'
	const exit_min = airport && !cleared ? 30 : 0 // arrival immigration + bags to landside
	const reentry_min = airport ? 45 : 0 // check-in, departure immigration, security, walk to gate
	const safety_min = airport ? 45 : 20
	const window_min = Math.round((mustReturnMs - startMs) / MIN)
	const departMs = startMs + exit_min * MIN
	const arriveByMs = mustReturnMs - (reentry_min + safety_min) * MIN
	const usable_min = Math.round((arriveByMs - departMs) / MIN)
	return { airport, exit_min, reentry_min, safety_min, window_min, usable_min, departMs, arriveByMs, mustReturnMs }
}

const STYLE_LEAD = {
	budget: 'Hawker Hustle',
	adventurous: 'Skyline Sprint',
	party: 'Neon Night Run',
	conservative: 'Easy Explorer'
}

/** Stop cap scales with the usable window (≈ one stop per 80 min), then energy and style nudge it. */
function maxStops(ctx, budget) {
	const byTime = Math.round((budget?.usable_min ?? 360) / 80)
	const energy = { low: -1, med: 0, high: 1 }[ctx.energy] ?? 0
	const style = ctx.style === 'adventurous' ? 1 : ctx.style === 'conservative' ? -1 : 0
	return Math.max(2, Math.min(10, byTime + energy + style))
}

const isFood = (p) => p.tags.includes('hawker') || p.tags.includes('food')

/** Variety: repeat categories lose value, a second meal loses a lot (nobody wants four hawker centres). */
function varietyFactor(p, visits) {
	const covered = new Set(visits.flatMap((v) => v.p.tags))
	const fresh = p.tags.filter((t) => !covered.has(t)).length / p.tags.length
	const meals = visits.filter((v) => isFood(v.p)).length
	const foodPenalty = isFood(p) ? Math.pow(0.35, meals) : 1
	return (0.45 + 0.55 * fresh) * foodPenalty
}

export function stayMinutes(place, ctx) {
	let m = place.duration_min
	if (ctx.energy === 'low') m *= 1.1
	if ((ctx.partySize || 1) >= 4) m *= 1.1
	return Math.round(m / 5) * 5
}

export function scorePlace(p, ctx, budget) {
	const tags = new Set(p.tags)
	const interests = ctx.interests || []
	const matches = interests.filter((i) => tags.has(i) || (i === 'food' && tags.has('hawker'))).length
	let s = 1 + 2.2 * matches
	if (p.captions?.length) s += 0.6 // curated icon
	const cost = p.cost_band ?? 1
	switch (ctx.style) {
		case 'budget':
			s += cost <= 1 ? 1 : cost === 3 ? -1.5 : 0
			if (tags.has('hawker')) s += 0.8
			break
		case 'adventurous':
			if (tags.has('views') || tags.has('nature')) s += 0.9
			if (tags.has('photo')) s += 0.4
			break
		case 'party':
			if (tags.has('nightlife')) s += 1.6
			if (tags.has('food')) s += 0.5
			if (tags.has('museum')) s -= 0.6
			break
		case 'conservative':
			if (p.indoor) s += 0.9
			if (tags.has('museum') || tags.has('heritage')) s += 0.7
			break
	}
	if (ctx.indoorPref === 'prefer' && p.indoor) s += 0.8
	if (ctx.energy === 'low' && p.duration_min > 60) s -= 0.5
	if (ctx.energy === 'high' && !p.indoor) s += 0.3
	// Airport-adjacent sights are saved for short windows: Sonion passes Jewel on the way back anyway.
	if (budget?.airport && p.area === 'Changi' && budget.usable_min >= 240) s *= 0.5
	return Math.max(0.2, s)
}

/** Max rain probability across the visit. ctx.rainAt(ms) → 0..100 (Open-Meteo hourly). */
function rainRisk(ctx, arriveMs, departMs) {
	if (ctx.forceRain) return 100
	if (!ctx.rainAt) return 0
	let worst = 0
	for (let t = arriveMs; t <= departMs; t += 30 * MIN) worst = Math.max(worst, ctx.rainAt(t) ?? 0)
	return worst
}

/**
 * Danger advisories (ctx.riskAt(point) → 0..4, see advisories.js): a warning (3) rules out
 * outdoor stops, a danger (4) rules out the place entirely.
 */
function tooRisky(ctx, p) {
	const s = ctx.riskAt ? ctx.riskAt(p) : 0
	return s >= 4 || (s >= 3 && !p.indoor)
}

/** Island-wide red alert (ctx.cityRisk = { severity, headline }): no plan leaves the airport. */
export function dangerRefusal(ctx) {
	if ((ctx.cityRisk?.severity ?? 0) < 4) return null
	return `Danger alert: ${ctx.cityRisk.headline}. Zoot won't plan a trip outside right now. Stay airside and check the official advisory.`
}

/** Catalog filter: interests, window size, exclusions, island-wide warnings. Hours, rain and local danger are checked per-visit. */
export function buildCandidates(ctx, budget) {
	const usableH = budget.usable_min / 60
	const exclude = ctx.excludeIds || new Set()
	const indoorOnly = ctx.forceIndoor || ctx.indoorPref === 'only' || (ctx.cityRisk?.severity ?? 0) >= 3
	return ctx.catalog
		.filter((p) => !exclude.has(p.id))
		.filter((p) => !p.min_window_h || usableH >= p.min_window_h)
		.filter((p) => !indoorOnly || p.indoor)
		.map((p) => ({ ...p, _score: scorePlace(p, ctx, budget) }))
}

/** Radius-bounded leader clustering with Turf distance: every member is ≤ 1.2 km from its leader. */
export function radiusClusters(cands, radiusM = CLUSTER_RADIUS_M) {
	const sorted = [...cands].sort((a, b) => b._score - a._score)
	const clusters = []
	const assigned = new Set()
	for (const leader of sorted) {
		if (assigned.has(leader.id)) continue
		const members = sorted.filter((p) => !assigned.has(p.id) && distanceM(leader, p) <= radiusM)
		members.forEach((m) => assigned.add(m.id))
		clusters.push({ leader, members, ids: new Set(members.map((m) => m.id)), score: members.reduce((s, m) => s + m._score, 0) })
	}
	return clusters
}

/** Can we visit p from `cur` at time t and still make it home? Returns the timed visit or null. */
function tryVisit(ctx, budget, cur, t, p) {
	const opts = { maxWalk: ctx.maxWalk, style: ctx.style }
	const tr = travel(cur, p, { ...opts, atMs: t })
	const arrive = t + tr.minutes * MIN
	const stay = stayMinutes(p, ctx)
	const depart = arrive + stay * MIN
	if (!isOpenDuringVisit(p, arrive, depart)) return null
	if (!p.indoor && rainRisk(ctx, arrive, depart) > RAIN_LIMIT) return null
	if (tooRisky(ctx, p)) return null
	const back = travel(p, ctx.origin, { ...opts, atMs: depart })
	if (depart + back.minutes * MIN > budget.arriveByMs) return null
	return { p, tr, arrive, depart, stay, back }
}

/**
 * Greedy nearest-neighbour + time budget. With a seed cluster the first stop must
 * come from it and cluster-mates get a bonus, so the day does not zig-zag.
 */
export function greedy(ctx, budget, cands, { seed = null, limit = maxStops(ctx, budget), start, variety = true }) {
	let cur = start.point
	let t = start.ms
	const visits = []
	const used = new Set()
	// With a long window, longer immersive stays are worth as much as quick photo stops.
	const abundance = Math.min(1, Math.max(0, (budget.usable_min - 240) / 480))
	while (visits.length < limit) {
		let best = null
		for (const p of cands) {
			if (used.has(p.id)) continue
			if (visits.length === 0 && seed && !seed.has(p.id)) continue
			if (visits.length > 0 && distanceM(cur, p) > ZIGZAG_LIMIT_M && !(seed && seed.has(p.id))) continue
			const v = tryVisit(ctx, budget, cur, t, p)
			if (!v) continue
			const worth = p._score * (variety ? varietyFactor(p, visits) : 1) * (1 + (abundance * v.stay) / 60)
			let value = worth / (v.tr.minutes + (0.35 - 0.2 * abundance) * v.stay + 6)
			if (seed && seed.has(p.id)) value *= 1.35
			if (visits.length > 0 && v.tr.mode !== 'walk') value *= 0.6
			if (!best || value > best.value) best = { ...v, value }
		}
		if (!best) break
		visits.push(best)
		used.add(best.p.id)
		cur = best.p
		t = best.depart
	}
	return visits
}

/** Plan quality: variety-weighted scores, one strong anchor ("the iconic view"), minus time on trains. */
export function planValue(visits) {
	const score = visits.reduce((s, v, i) => s + v.p._score * varietyFactor(v.p, visits.slice(0, i)), 0)
	const anchor = Math.max(0, ...visits.map((v) => v.p._score))
	const travelMin = visits.reduce((s, v) => s + v.tr.minutes, 0)
	return score + 0.8 * anchor - 0.03 * travelMin
}

function xpFor(p, stay) {
	return 40 + Math.round(stay / 15) * 10 + (p.indoor ? 0 : 10) + (p.captions?.length ? 15 : 0)
}

function whyFor(p, ctx, v) {
	const hits = (ctx.interests || []).filter((i) => p.tags.includes(i))
	const lead = hits.length ? `Hits your ${hits.slice(0, 2).join(' + ')} list` : 'A strong all-rounder nearby'
	const how = v.tr.mode === 'walk' ? `${v.tr.minutes} min walk` : v.tr.mode === 'mrt' ? `${v.tr.minutes} min by MRT` : `${v.tr.minutes} min by taxi`
	const first = p.blurb.split(/(?<=[.!?])\s/)[0]
	return `${lead} · ${how}. ${first}`
}

function titleFor(ctx, visits) {
	const areas = [...new Set(visits.map((v) => v.p.area))]
	return `${STYLE_LEAD[ctx.style] || 'Layover Quest'}: ${areas.slice(0, 2).join(' & ')}`
}

/** Turn timed visits into mission legs + mandatory "Return to origin" leg. */
export function assembleMission(ctx, budget, visits, meta = {}) {
	const legs = visits.map((v, i) => ({
		seq: i + 1,
		kind: 'visit',
		place_id: v.p.id,
		name: v.p.name,
		area: v.p.area,
		lat: v.p.lat,
		lng: v.p.lng,
		indoor: v.p.indoor,
		arrive_iso: new Date(v.arrive).toISOString(),
		depart_iso: new Date(v.depart).toISOString(),
		travel_mode: v.tr.mode,
		travel_min: v.tr.minutes,
		travel_detail: v.tr.detail,
		stay_min: v.stay,
		why: (meta.why && meta.why[v.p.id]) || whyFor(v.p, ctx, v),
		xp: xpFor(v.p, v.stay),
		status: v.status || 'pending'
	}))
	// Head home from the last *new* stop, or from where the traveller is now if a replan found nothing new.
	const last = visits[visits.length - 1]
	const lastIsNew = last && last.status !== 'stamped'
	const leaveMs = lastIsNew ? last.depart : ctx.start?.ms ?? budget.departMs
	const back = lastIsNew ? last.back : travel(ctx.start?.point || ctx.origin, ctx.origin, { maxWalk: ctx.maxWalk, style: ctx.style, atMs: leaveMs })
	const homeMs = leaveMs + back.minutes * MIN
	legs.push({
		seq: legs.length + 1,
		kind: 'return',
		place_id: 'origin',
		name: `Return to ${ctx.origin.label}`,
		lat: ctx.origin.lat,
		lng: ctx.origin.lng,
		arrive_iso: new Date(homeMs).toISOString(),
		depart_iso: new Date(homeMs).toISOString(),
		arrive_by: new Date(budget.arriveByMs).toISOString(),
		travel_mode: back.mode,
		travel_min: back.minutes,
		travel_detail: back.detail,
		stay_min: 0,
		why: budget.airport
			? `Be back by ${formatTime(budget.arriveByMs)}: ${budget.reentry_min} min for check-in, immigration and security, plus a ${budget.safety_min} min safety margin before your gate time.`
			: `Back by ${formatTime(budget.arriveByMs)} with a ${budget.safety_min} min safety margin.`,
		xp: 100,
		status: 'pending'
	})
	return {
		schema: MISSION_SCHEMA,
		id: meta.id || crypto.randomUUID(),
		trip_id: ctx.tripId || null,
		title: meta.title || titleFor(ctx, visits),
		style: ctx.style,
		origin: { label: ctx.origin.label, lat: ctx.origin.lat, lng: ctx.origin.lng, kind: ctx.origin.kind },
		start_iso: new Date(ctx.startMs).toISOString(),
		must_return_iso: new Date(budget.mustReturnMs).toISOString(),
		buffers: { exit_min: budget.exit_min, reentry_min: budget.reentry_min, safety_min: budget.safety_min },
		prefs: pickPrefs(ctx),
		total_out_min: Math.round((homeMs - budget.departMs) / MIN),
		buffer_min: Math.round((budget.mustReturnMs - homeMs) / MIN),
		source: meta.source || 'fallback',
		groq_model: meta.groq_model || null,
		fallback_used: meta.source !== 'groq',
		created_at: new Date().toISOString(),
		legs
	}
}

function pickPrefs(ctx) {
	const { style, interests, energy, indoorPref, maxWalk, partySize, cleared } = ctx
	return { style, interests, energy, indoorPref, maxWalk, partySize, cleared }
}

function startOf(ctx, budget) {
	return ctx.start || { point: ctx.origin, ms: budget.departMs }
}

/**
 * Deterministic fallback planner. Always available, never calls the network.
 * @returns {{ok:true, mission:object, budget:object} | {ok:false, reason:string, budget:object}}
 */
export function planDeterministic(ctx) {
	const budget = computeBudget(ctx)
	const danger = dangerRefusal(ctx)
	if (danger) return { ok: false, budget, reason: danger }
	if (budget.usable_min < 60) {
		return { ok: false, budget, reason: `Only ${Math.max(0, budget.usable_min)} usable minutes after buffers. Stay airside. Leaving the airport is not safe with this window.` }
	}
	const start = startOf(ctx, budget)
	const cands = buildCandidates(ctx, budget)
	const clusters = radiusClusters(cands).sort((a, b) => b.score - a.score).slice(0, 10)
	let best = null
	for (const c of clusters) {
		const visits = greedy(ctx, budget, cands, { seed: c.ids, start })
		if (!visits.length) continue
		const value = planValue(visits)
		if (!best || value > best.value) best = { visits, value }
	}
	if (!best) {
		const tight = greedy(ctx, budget, cands, { start })
		if (tight.length) best = { visits: tight }
	}
	const kept = (ctx.keepVisits || [])
	if (!best && !kept.length) {
		return { ok: false, budget, reason: 'Nothing fits between now and your return time once travel and buffers are counted. The planner refuses rather than risk your flight.' }
	}
	const visits = [...kept, ...(best?.visits || [])]
	return { ok: true, budget, mission: assembleMission({ ...ctx, start }, budget, visits, ctx.meta) }
}

/** Sequence places Groq picked (ids) with the same clock rules. Drops picks that do not fit. */
export function sequencePicks(ctx, pickIds, meta) {
	const budget = computeBudget(ctx)
	const start = startOf(ctx, budget)
	const byId = new Map(buildCandidates(ctx, budget).map((p) => [p.id, p]))
	const picks = pickIds.map((id) => byId.get(id)).filter(Boolean)
	// Nearest-neighbour order: equal scores make value ∝ 1 / travel time.
	const flat = picks.map((p) => ({ ...p, _score: 1 }))
	const visits = greedy(ctx, budget, flat, { limit: 10, start, variety: false })
	if (!visits.length) return { ok: false, budget, reason: 'None of the chosen places fit the clock.' }
	const kept = ctx.keepVisits || []
	return { ok: true, budget, mission: assembleMission({ ...ctx, start }, budget, [...kept, ...visits], meta), dropped: picks.length - visits.length }
}

/** Candidate slice handed to Groq: individually feasible places, best first. */
export function groqCatalogSlice(ctx, limit = 36) {
	const budget = computeBudget(ctx)
	const start = startOf(ctx, budget)
	return buildCandidates(ctx, budget)
		.filter((p) => tryVisit(ctx, budget, start.point, start.ms, p) || tryVisit(ctx, budget, start.point, start.ms + 60 * MIN, p))
		.sort((a, b) => b._score - a._score)
		.slice(0, limit)
		.map((p) => ({ id: p.id, name: p.name, area: p.area, tags: p.tags, duration_min: p.duration_min, indoor: p.indoor, cost_band: p.cost_band }))
}

/**
 * Real times for stamped legs, in the order they happened: arrived when stamped, stayed the
 * planned time, but left before the next stamp and never after `capMs` (the traveller has
 * moved on). Planned times would be wrong for anyone ahead of schedule.
 */
function stampedTimes(legs, capMs = Infinity) {
	const done = legs
		.filter((l) => l.kind === 'visit' && l.status === 'stamped')
		.map((l) => ({ l, arrive: Date.parse(l.stamped_at || l.arrive_iso) }))
		.sort((a, b) => a.arrive - b.arrive)
	return done.map(({ l, arrive }, i) => {
		const until = Math.min(done[i + 1]?.arrive ?? Infinity, capMs)
		const depart = Math.max(arrive, Math.min(arrive + l.stay_min * MIN, until))
		return { l, arrive, depart, stay: Math.round((depart - arrive) / MIN) }
	})
}

/**
 * Rebuild visits already stamped so a replan keeps them and replaces only future legs.
 * `capMs` is when the replan starts: no finished stop can end after it.
 */
export function keptVisits(mission, catalogById, capMs) {
	return stampedTimes(mission.legs, capMs).map(({ l, arrive, depart, stay }) => {
		const p = catalogById.get(l.place_id) || l
		return {
			p: { ...p, _score: 0 },
			tr: { mode: l.travel_mode, minutes: l.travel_min, detail: l.travel_detail },
			arrive,
			depart,
			stay,
			status: 'stamped',
			back: travel(p, mission.origin, { atMs: depart })
		}
	})
}

/**
 * Re-time a live mission from `start` ({point, ms}) without choosing new places: stamped legs
 * take their real times, pending legs and the return leg follow on with fresh travel times.
 * Returns the new mission and what the new times break (a stop closed on arrival, or back
 * after arrive_by); the caller answers problems with a full replan.
 */
export function retimeMission(mission, { start, catalogById }) {
	const m = JSON.parse(JSON.stringify(mission))
	const opts = { maxWalk: m.prefs?.maxWalk, style: m.style }
	const iso = (ms) => new Date(ms).toISOString()
	const problems = []

	const done = stampedTimes(m.legs, start.ms).map(({ l, arrive, depart, stay }) => {
		Object.assign(l, { arrive_iso: iso(arrive), depart_iso: iso(depart), stay_min: stay })
		return l
	})
	const skipped = m.legs.filter((l) => l.kind === 'visit' && l.status === 'skipped')
	const pending = m.legs.filter((l) => l.kind === 'visit' && l.status === 'pending')
	const ret = m.legs.find((l) => l.kind === 'return')

	let t = start.ms
	let cur = start.point
	for (const l of pending) {
		const p = catalogById.get(l.place_id) || l
		const tr = travel(cur, p, { ...opts, atMs: t })
		const arrive = t + tr.minutes * MIN
		const depart = arrive + l.stay_min * MIN
		Object.assign(l, { travel_mode: tr.mode, travel_min: tr.minutes, travel_detail: tr.detail, arrive_iso: iso(arrive), depart_iso: iso(depart) })
		if (!isOpenDuringVisit(p, arrive, depart)) problems.push(`${l.name} would be closed when you get there`)
		t = depart
		cur = p
	}
	const back = travel(cur, m.origin, { ...opts, atMs: t })
	const homeMs = t + back.minutes * MIN
	Object.assign(ret, { travel_mode: back.mode, travel_min: back.minutes, travel_detail: back.detail, arrive_iso: iso(homeMs), depart_iso: iso(homeMs) })
	if (homeMs > Date.parse(ret.arrive_by)) problems.push(`You would be back at ${formatTime(homeMs)}, after ${formatTime(ret.arrive_by)}`)

	m.legs = [...done, ...skipped, ...pending, ret]
	m.legs.forEach((l, i) => (l.seq = i + 1))
	m.total_out_min = Math.round((homeMs - Date.parse(m.start_iso)) / MIN) - m.buffers.exit_min
	m.buffer_min = Math.round((Date.parse(m.must_return_iso) - homeMs) / MIN)
	return { mission: m, problems }
}

/** Remaining slack: minutes spare if the traveller follows the rest of the plan from `here` at `nowMs`. */
export function slackMinutes(mission, here, nowMs, catalogById) {
	const arriveBy = Date.parse(mission.legs.at(-1).arrive_by)
	let t = nowMs
	let cur = here
	const opts = { maxWalk: mission.prefs?.maxWalk, style: mission.style }
	for (const l of mission.legs) {
		if (l.kind !== 'visit' || l.status === 'stamped' || l.status === 'skipped') continue
		const p = catalogById.get(l.place_id) || l
		t += travel(cur, p, { ...opts, atMs: t }).minutes * MIN + l.stay_min * MIN
		cur = p
	}
	t += travel(cur, mission.origin, { ...opts, atMs: t }).minutes * MIN
	return Math.round((arriveBy - t) / MIN)
}

/** Latest moment to start heading back from `here` and still make arrive_by. */
export function leaveByMs(mission, here, nowMs) {
	const arriveBy = Date.parse(mission.legs.at(-1).arrive_by)
	const back = travel(here, mission.origin, { maxWalk: mission.prefs?.maxWalk, style: mission.style, atMs: nowMs })
	return { ms: arriveBy - back.minutes * MIN, back }
}

export { nearestHub }