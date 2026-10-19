// Headless check of the golden path: `npm run test:planner`
import { readFileSync } from 'node:fs'
import { planDeterministic, keptVisits, retimeMission } from '../src/model/services/planner.js'
import { formatTime } from '../src/model/services/hours.js'
import { validateMission } from '../src/model/services/itinerarySchema.js'
import { mrtRunning, distanceM } from '../src/model/services/travel.js'
import { forcedAdvisories, riskAt, cityRisk, psiSeverity, psiCategory, psiHeadline } from '../src/model/services/advisories.js'

const catalog = JSON.parse(readFileSync(new URL('../src/model/data/places.sg.json', import.meta.url)))
const T3 = { label: 'Changi Airport T3', kind: 'airport', lat: 1.3563, lng: 103.9866 }
const start = Date.parse('2026-09-25T02:00:00Z') // 10:00 SGT

const cases = [
	{ name: 'Sonion 8h budget', hours: 8, style: 'budget', interests: ['hawker', 'gardens', 'photo'] },
	{ name: 'Sonion 14h adventurous', hours: 14, style: 'adventurous', interests: ['hawker', 'gardens', 'photo'] },
	{ name: 'Sonion 8h forced rain', hours: 8, style: 'budget', interests: ['hawker', 'gardens', 'photo'], forceRain: true },
	{ name: 'Sonion 14h forced rain', hours: 14, style: 'adventurous', interests: ['hawker', 'gardens', 'photo'], forceRain: true },
	{ name: '6h party', hours: 6, style: 'party', interests: ['nightlife', 'food'] },
	{ name: 'Late 14h (MRT closes)', hours: 14, style: 'budget', interests: ['hawker', 'nightlife'], startOffsetH: 8 },
	{ name: '2h refuse', hours: 2, style: 'budget', interests: ['hawker'] }
]

let failures = 0
for (const c of cases) {
	const s0 = start + (c.startOffsetH || 0) * 3600e3
	const ctx = {
		catalog, origin: T3, startMs: s0, mustReturnMs: s0 + c.hours * 3600e3,
		style: c.style, interests: c.interests, energy: 'med', maxWalk: 18, forceRain: c.forceRain
	}
	const r = planDeterministic(ctx)
	console.log(`\n## ${c.name}`)
	if (!r.ok) { console.log('REFUSED:', r.reason); continue }
	const m = r.mission
	const v = validateMission(m, new Set(catalog.map((p) => p.id)))
	if (!v.ok) { failures++; console.log('INVALID', v.errors) }
	console.log(m.title, `| out ${m.total_out_min} min | buffer ${m.buffer_min} min`)
	for (const l of m.legs) console.log(`  ${l.seq}. ${formatTime(l.arrive_iso)}–${formatTime(l.depart_iso)} ${l.name} [${l.travel_mode} ${l.travel_min}m, stay ${l.stay_min}] ${l.indoor === false ? 'OUTDOOR' : ''}`)
	if (m.buffer_min < 45) { failures++; console.log('FAIL: buffer < 45') }
	if (c.forceRain && m.legs.some((l) => l.kind === 'visit' && !l.indoor)) { failures++; console.log('FAIL: outdoor leg in rain') }
	const lateMrt = m.legs.find((l) => l.travel_mode === 'mrt' && !mrtRunning(Date.parse(l.arrive_iso) - l.travel_min * 60000))
	if (lateMrt) { failures++; console.log(`FAIL: MRT leg to ${lateMrt.name} after the trains stop`) }
}
// ── Mid-walk: traveller is ahead of schedule ─────────────────────────────
// Stamp the first two stops early, then replan / re-time. Finished stops must take
// their real times, or the first new stop "starts before the previous one ends".
{
	const byId = new Map(catalog.map((p) => [p.id, p]))
	const placeIds = new Set(catalog.map((p) => p.id))
	const ctx = { catalog, origin: T3, startMs: start, mustReturnMs: start + 8 * 3600e3, style: 'budget', interests: ['hawker', 'gardens', 'photo'], energy: 'med', maxWalk: 18 }
	const early = () => {
		const m = structuredClone(planDeterministic(ctx).mission)
		const [a, b] = m.legs
		a.status = 'stamped'
		a.stamped_at = new Date(Date.parse(a.arrive_iso) - 40 * 60000).toISOString()
		b.status = 'stamped'
		b.stamped_at = new Date(Date.parse(b.arrive_iso) - 60 * 60000).toISOString()
		return { m, b, nowMs: Date.parse(b.stamped_at) + 10 * 60000 }
	}
	const check = (name, mission, extra = true) => {
		const v = validateMission(mission, placeIds)
		const ok = v.ok && extra
		console.log(`${ok ? 'ok  ' : 'FAIL'} ahead of schedule: ${name}${v.ok ? '' : ' → ' + v.errors[0]}`)
		if (!ok) failures++
	}

	for (const mode of ['rain', 'behind']) {
		const { m, b, nowMs } = early()
		const r = planDeterministic({
			...ctx, forceIndoor: mode === 'rain', energy: mode === 'behind' ? 'low' : 'med',
			excludeIds: new Set([m.legs[0].place_id, b.place_id]),
			start: { point: b, ms: nowMs }, keepVisits: keptVisits(m, byId, nowMs), meta: { id: m.id }
		})
		check(`${mode} replan`, r.mission, r.ok && Date.parse(r.mission.legs[1].depart_iso) <= nowMs)
	}

	const { m, b } = early()
	const startMs = Date.parse(b.stamped_at) + b.stay_min * 60000
	const { mission: rt, problems } = retimeMission(m, { start: { point: b, ms: startMs }, catalogById: byId })
	const next = rt.legs.find((l) => l.status === 'pending')
	check(`re-time after stamp (${problems.length} problem(s))`, rt,
		Date.parse(rt.legs[1].arrive_iso) === Date.parse(b.stamped_at) && Date.parse(next.arrive_iso) === startMs + next.travel_min * 60000)
}

// ── Danger advisories (GDACS / NEA / PUB shape) ──────────────────────────
{
	const ctx = { catalog, origin: T3, startMs: start, mustReturnMs: start + 8 * 3600e3, style: 'adventurous', interests: ['gardens', 'photo', 'hawker'], energy: 'med', maxWalk: 18 }
	const withAdv = (list) => ({ ...ctx, riskAt: (p) => riskAt(list, p).severity, cityRisk: { severity: cityRisk(list).severity, headline: cityRisk(list).advisory?.headline } })
	const base = planDeterministic(ctx).mission
	const outdoor = base.legs.find((l) => l.kind === 'visit' && !l.indoor)
	const visits = (m) => m.legs.filter((l) => l.kind === 'visit')
	const report = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} advisory: ${name}${extra}`); if (!ok) failures++ }

	const pin = { lat: outdoor.lat, lng: outdoor.lng, name: outdoor.name }
	const lightning = planDeterministic(withAdv(forcedAdvisories({ lightning: pin }))).mission
	const strike = { lat: pin.lat + 0.006, lng: pin.lng }
	report('lightning → no outdoor stop within 5 km of the strike',
		!visits(lightning).some((l) => !l.indoor && distanceM(l, strike) <= 5000), ` (dropped ${outdoor.name})`)

	const flood = planDeterministic(withAdv(forcedAdvisories({ flood: pin }))).mission
	report('flood → nothing within 2 km of it, indoor or not', !visits(flood).some((l) => distanceM(l, pin) <= 2000))

	const haze = planDeterministic(withAdv(forcedAdvisories({ haze: pin }))).mission
	report('haze PSI 180 → indoor only', visits(haze).length > 0 && visits(haze).every((l) => l.indoor))

	const red = planDeterministic(withAdv(forcedAdvisories({ disaster: pin })))
	report('GDACS red alert → refuse', !red.ok && /Danger alert/.test(red.reason))

	report('PSI bands', [50, 51, 100, 101, 200, 201].map(psiSeverity).join() === '1,2,2,3,3,4')
	report('PSI categories (NEA table)', [0, 50, 51, 100, 101, 200, 201, 300, 301, 500].map(psiCategory).join() ===
		'Good,Good,Moderate,Moderate,Unhealthy,Unhealthy,Very Unhealthy,Very Unhealthy,Hazardous,Hazardous')
	const regions = (vals) => ['north', 'south', 'east', 'west', 'central'].map((region, i) => ({ region, psi: vals[i] }))
	const all = psiHeadline(regions([125, 157, 172, 190, 178]))
	const some = psiHeadline(regions([80, 95, 172, 190, 99]))
	report('PSI headline, all regions Unhealthy → no region', all === 'Haze: 24-h PSI 190 (Unhealthy)', ` "${all}"`)
	report('PSI headline, only some → names them', some === 'Haze: 24-h PSI 190 (Unhealthy) in the east and west', ` "${some}"`)
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll planner checks passed.')

// ── Groq pipeline with a mocked /api/plan ────────────────────────────────
const { buildMission } = await import('../src/model/services/groq.js')
const baseCtx = {
	catalog, origin: T3, startMs: start, mustReturnMs: start + 8 * 3600e3,
	style: 'budget', interests: ['hawker', 'gardens', 'photo'], energy: 'med', maxWalk: 18
}
const reply = (status, json) => async () => ({ status, ok: status < 300, json: async () => json })
const choice = (ids) => ({ model: 'mock-llama', choice: { schema: 'zoot.choice.v1', title: 'Satay & Supertrees', picks: ids.map((id) => ({ place_id: id, why: `Because ${id} rocks.` })) } })

async function groqCase(name, responses, expect) {
	let calls = 0
	globalThis.fetch = async (...a) => responses[Math.min(calls++, responses.length - 1)](...a)
	const r = await buildMission(baseCtx)
	const ok = expect(r, calls)
	console.log(`${ok ? 'ok  ' : 'FAIL'} groq: ${name} → ${r.source}, ${calls} call(s)${r.fallbackReason ? ` (${r.fallbackReason.slice(0, 60)})` : ''}`)
	if (!ok) failures++
}

await groqCase('valid picks are timed by the app', [reply(200, choice(['maxwell-food-centre', 'cloud-forest', 'supertree-grove']))],
	(r, calls) => r.ok && r.source === 'groq' && calls === 1 && r.mission.title === 'Satay & Supertrees' && r.mission.legs.at(-1).kind === 'return' && r.mission.buffer_min >= 90)
await groqCase('hallucinated id → retry once → valid', [reply(200, choice(['changi-hilton-rooftop'])), reply(200, choice(['maxwell-food-centre', 'supertree-grove']))],
	(r, calls) => r.ok && r.source === 'groq' && calls === 2)
await groqCase('invalid twice → deterministic fallback', [reply(200, { model: 'x', choice: { schema: 'nope' } })],
	(r, calls) => r.ok && r.source === 'fallback' && calls === 2)
await groqCase('no key (503) → fallback without retry', [reply(503, { error: 'GROQ_API_KEY is not set' })],
	(r, calls) => r.ok && r.source === 'fallback' && calls === 1)
await groqCase('network error → fallback', [async () => { throw new Error('offline') }],
	(r) => r.ok && r.source === 'fallback')

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('All Groq pipeline checks passed.')