import { validateChoice, validateMission } from './itinerarySchema.js';
import { planDeterministic, sequencePicks, groqCatalogSlice, computeBudget, dangerRefusal } from './planner.js';

/*
	Mission pipeline:
		1. Groq chooses the stops
		2. Validate the choice (retry once if it is bad)
		3. Time the route with Turf/MRT, then validate the mission

	On any failure, we use the deterministic (greedy) planner instead, so the demo never dies.
*/

const MS_PER_MINUTE = 60 * 1000;
const MAX_GROQ_ATTEMPTS = 2; // First try + one retry
const PLAN_TIMEOUT_MS = 15000;
const SUMMARY_TIMEOUT_MS = 12000;
const RAIN_SEVERITY_THRESHOLD = 3; // City risk at or above this counts as "rain risk"
const SUMMARY_CACHE_PREFIX = 'zoot.summary.';

// Sends a POST request with a JSON body and gives up after timeoutMs
// Returns { status, ok, json }. json is {} if the response is not valid JSON
async function postJson(url, body, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: controller.signal
		});
		const json = await res.json().catch(() => ({}));
		return { status: res.status, ok: res.ok, json };
	}
	finally {
		clearTimeout(timer); // Always stop the timer, even if the request failed
	}
}

// Joins the first 3 validation errors into one short message
function summariseErrors(errors) {
	return errors.slice(0, 3).join('; ');
}

// Builds the request body that we send to Groq (via /api/plan)
function buildPlanRequest(ctx, slice, budget, startMs) {
	return {
		input: {
			origin: ctx.origin,
			start_iso: new Date(startMs).toISOString(),
			must_return_iso: new Date(ctx.mustReturnMs).toISOString(),
			energy: ctx.energy,
			style: ctx.style,
			interests: ctx.interests,
			indoor_pref: ctx.indoorPref,
			max_walk_min_per_leg: ctx.maxWalk,
			party_size: ctx.partySize
		},
		leftover_min: Math.round((budget.arriveByMs - startMs) / MS_PER_MINUTE),
		rain_risk: Boolean(ctx.forceRain || ctx.forceIndoor || (ctx.cityRisk?.severity ?? 0) >= RAIN_SEVERITY_THRESHOLD),
		catalog: slice
	};
}

// Asks Groq for a plan once, then checks it
// Returns one of:
//   { result }                 -> success, result is the finished mission
//   { reason }                 -> failed, but trying again may work
//   { reason, giveUp: true }   -> failed, trying again will not help
async function askGroqOnce(ctx, { slice, allowed, placeIds, budget, startMs }) {
	try {
		const res = await postJson('/api/plan', buildPlanRequest(ctx, slice, budget, startMs), PLAN_TIMEOUT_MS);

		// Groq is not available at all, so a retry is pointless
		if (res.status === 404 || res.status === 503) {
			return { reason: res.json.error || 'Groq unavailable', giveUp: true };
		}
		if (!res.ok) return { reason: res.json.error || `HTTP ${res.status}` };

		// Check that Groq only picked places from the list we gave it
		const choice = res.json.choice;
		const choiceCheck = validateChoice(choice, allowed);
		if (!choiceCheck.ok) return { reason: summariseErrors(choiceCheck.errors) };

		// Work out the route and timings for Groq's picks
		const why = Object.fromEntries(choice.picks.map((pick) => [pick.place_id, pick.why]));
		const sequenced = sequencePicks(ctx, choice.picks.map((pick) => pick.place_id), {
			...ctx.meta,
			title: choice.title,
			why,
			source: 'groq',
			groq_model: res.json.model
		});
		if (!sequenced.ok) return { reason: sequenced.reason };

		// Check that the finished mission is valid
		const missionCheck = validateMission(sequenced.mission, placeIds);
		if (!missionCheck.ok) return { reason: summariseErrors(missionCheck.errors) };

		return { result: { ...sequenced, source: 'groq' } };
	}
	catch (error) {
		return { reason: error.name === 'AbortError' ? 'Groq timed out' : error.message };
	}
}

// Plans without Groq, using the deterministic (greedy) planner
// fallbackReason explains why we are not using Groq (null if we never tried)
function planOffline(ctx, placeIds, fallbackReason) {
	const result = planDeterministic({ ...ctx, meta: { ...ctx.meta, source: 'fallback' } });

	if (result.ok) {
		const missionCheck = validateMission(result.mission, placeIds);
		if (!missionCheck.ok) {
			return { ok: false, budget: result.budget, reason: 'Planner produced an invalid mission: ' + missionCheck.errors[0] };
		}
		result.mission.fallback_reason = fallbackReason;
	}
	return { ...result, source: 'fallback', fallbackReason };
}

// Builds a mission: tries Groq (up to MAX_GROQ_ATTEMPTS times), then falls back to the offline planner
// onStatus (optional) is called with messages to show the user
export async function buildMission(ctx, { onStatus } = {}) {
	const placeIds = new Set(ctx.catalog.map((place) => place.id));
	const slice = groqCatalogSlice(ctx); // The places Groq is allowed to pick from
	const allowed = new Set(slice.map((place) => place.id));
	const budget = computeBudget(ctx);
	const startMs = ctx.start?.ms ?? budget.departMs;

	// Refuse straight away if the trip is unsafe
	const danger = dangerRefusal(ctx);
	if (danger) return { ok: false, budget, reason: danger, source: 'fallback' };

	let reason = null; // Why Groq failed, if it did
	const canUseGroq = slice.length > 0 && !ctx.offlineOnly;

	if (canUseGroq) {
		for (let attempt = 1; attempt <= MAX_GROQ_ATTEMPTS; attempt++) {
			onStatus?.(attempt === 1 ? 'Groq is choosing your stops…' : 'Groq went off-script — retrying once…');

			const outcome = await askGroqOnce(ctx, { slice, allowed, placeIds, budget, startMs });
			if (outcome.result) return outcome.result;

			reason = outcome.reason;
			if (outcome.giveUp) break;
		}
	}

	onStatus?.('Planning offline with the route engine…');
	return planOffline(ctx, placeIds, reason);
}

// Returns the saved summary for a place, or null if there is none
// localStorage can be unavailable or hold bad data, so any error means "no cache"
function readCachedSummary(key) {
	try {
		return JSON.parse(localStorage.getItem(key));
	}
	catch (error) {
		return null;
	}
}

// Saves a summary so we do not have to ask Groq again. Failing to save is fine
function saveCachedSummary(key, summary) {
	try {
		localStorage.setItem(key, JSON.stringify(summary));
	}
	catch (error) {
		// Ignore: the summary just will not be cached
	}
}

// Builds a summary from the place's own stored text (no AI needed)
function storedSummary(place) {
	return {
		summary: [place.blurb, place.captions?.[0]].filter(Boolean).join(' '),
		tips: [place.captions?.[1], place.safety_notes].filter(Boolean).slice(0, 2),
		source: 'stored'
	};
}

// Gets the AI blurb for a place page
// Order: saved copy -> ask Groq (and save the answer) -> stored text from the place
export async function summarizePlace(place) {
	const key = SUMMARY_CACHE_PREFIX + place.id;

	const cached = readCachedSummary(key);
	if (cached) return cached;

	try {
		const res = await postJson('/api/summary', { place }, SUMMARY_TIMEOUT_MS);
		if (res.ok && res.json.summary) {
			const summary = { summary: res.json.summary, tips: res.json.tips || [], source: 'groq', model: res.json.model };
			saveCachedSummary(key, summary);
			return summary;
		}
	}
	catch (error) {
		// Ignore: fall through to the stored text below
	}

	return storedSummary(place);
}