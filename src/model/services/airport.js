import { HUBS, transit, mrtRunning, taxiMinutes, distanceM } from './travel.js'
import { formatTime } from './hours.js'

/**
 * "I need to get to the airport" planner.
 *
 * Given the traveller's current position (and the active mission for the flight
 * deadline), compare the two realistic ways to Changi — MRT and Grab/taxi — and
 * explain which one to take, how long it should take, and how to book/board it.
 *
 * This is intentionally separate from the itinerary planner: it never reshuffles
 * stops, it just answers "how do I leave right now?".
 */

// A taxi estimate is a point estimate; traffic and finding the pickup can add
// time. Include a little buffer when comparing it with the (predictable) MRT and
// when checking the flight deadline.
const TAXI_BUFFER_MIN = 8

// A named pickup point is more useful than "wherever you are"; use the nearest
// catalog place if one is this close.
const PICKUP_RADIUS_M = 180

/** Turn the Dijkstra path into readable "line: from → to" legs. */
function mrtLegs(route) {
  const legs = []

  for (let i = 0; i < route.edgeLines.length; i++) {
    const line = route.edgeLines[i]
    const from = HUBS[route.path[i]]?.name
    const to = HUBS[route.path[i + 1]]?.name
    if (!from || !to) continue

    const last = legs.at(-1)
    if (last && last.line === line) last.to = to
    else legs.push({ line, from, to })
  }

  return legs
}

function summaryFor({ recommended, chosenMinutes, deadlineMs, minutesLeft, onTime, arrivalMs }) {
  const mode = recommended === 'mrt' ? 'the MRT' : 'a Grab'

  if (!Number.isFinite(deadlineMs)) {
    return `Fastest option: ${mode}, about ${chosenMinutes} min from here.`
  }
  if (minutesLeft != null && minutesLeft <= 0) {
    return `You're past your airport time. Take ${mode} now (about ${chosenMinutes} min) and head straight to your airline counter.`
  }
  if (onTime) {
    const spare = Math.max(0, Math.round((deadlineMs - arrivalMs) / 60000))
    return `Fastest option: ${mode} (about ${chosenMinutes} min). You'd arrive by ${formatTime(arrivalMs)}, ${spare} min before your airport time.`
  }
  return `Neither option gets you to the airport by ${formatTime(deadlineMs)}. Take ${mode} now (about ${chosenMinutes} min) and go straight to the counter.`
}

/**
 * @param {object} args
 * @param {{lat:number,lng:number}|null} args.from   current position
 * @param {object|null} args.mission                 active mission (for arrive_by)
 * @param {number} args.nowMs                        app clock (tick.value)
 * @param {object[]} args.places                     catalog, for naming the pickup
 * @returns {object} plan
 */
export function airportPlan({ from, mission = null, nowMs = Date.now(), places = [] } = {}) {
  if (!from) {
    return {
      ok: false,
      reason: 'Waiting for GPS… Allow location access, or turn on Demo-Walk to get directions from here.'
    }
  }

  // If the traveller is going back to the airport they started from, use that
  // terminal; otherwise default to Changi Airport.
  const terminal = mission?.origin?.kind === 'airport' ? mission.origin : null
  const destination = terminal
    ? { label: terminal.label || 'Changi Airport', lat: terminal.lat, lng: terminal.lng }
    : { label: 'Changi Airport', lat: HUBS.changi_airport.lat, lng: HUBS.changi_airport.lng }

  const returnLeg = mission?.legs?.find((leg) => leg.kind === 'return')
  const deadlineMs = returnLeg?.arrive_by ? Date.parse(returnLeg.arrive_by) : null
  const minutesLeft = Number.isFinite(deadlineMs) ? Math.round((deadlineMs - nowMs) / 60000) : null

  // Already at the airport (or in the terminal complex): no transport needed.
  if (distanceM(from, destination) < 900) {
    const late = Number.isFinite(deadlineMs) && minutesLeft != null && minutesLeft < 0
    return {
      ok: true,
      atAirport: true,
      destination,
      deadlineMs,
      minutesLeft,
      onTime: Number.isFinite(deadlineMs) ? !late : null,
      mrt: null,
      taxi: null,
      recommended: null,
      pickup: null,
      summary: late
        ? `You're at ${destination.label}, but you're past your airport time. Go straight to your airline counter.`
        : `You're already at ${destination.label}. Follow the signs to your terminal and check in.`
    }
  }

  // ── MRT ──
  const mrtRoute = transit(from, destination)
  const trainsRunning = mrtRunning(nowMs)
  const mrt = mrtRoute
    ? {
        available: trainsRunning,
        minutes: mrtRoute.minutes,
        walkToStationMin: mrtRoute.walkToHubMin,
        walkFromStationMin: mrtRoute.walkFromHubMin,
        waitMin: mrtRoute.waitMin,
        station: mrtRoute.from,
        lines: mrtRoute.lines,
        legs: mrtLegs(mrtRoute),
        note: trainsRunning
          ? null
          : 'The last trains have gone for today (roughly 23:30). Take a Grab instead.'
      }
    : null

  // ── Grab / taxi ──
  const taxi = {
    minutes: taxiMinutes(from, destination),
    km: Math.round((distanceM(from, destination) / 1000) * 10) / 10
  }
  taxi.effectiveMinutes = taxi.minutes + TAXI_BUFFER_MIN

  // Prefer the train when it is at least as fast as a car (with the taxi buffer).
  const recommended = mrt?.available && mrt.minutes <= taxi.effectiveMinutes ? 'mrt' : 'taxi'
  const chosenMinutes = recommended === 'mrt' ? mrt.minutes : taxi.effectiveMinutes
  const arrivalMs = nowMs + chosenMinutes * 60000
  const onTime = Number.isFinite(deadlineMs) ? arrivalMs <= deadlineMs : null

  // Name the pickup point if a catalog place is right here.
  const nearest = places
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
    .map((place) => ({ place, distance: distanceM(from, place) }))
    .filter((candidate) => candidate.distance <= PICKUP_RADIUS_M)
    .sort((a, b) => a.distance - b.distance)[0]?.place

  const pickup = {
    label: nearest?.name || 'your current location',
    hint: nearest
      ? `Meet the driver at the main entrance or taxi stand at ${nearest.name}.`
      : 'Set the pick-up pin to where you are and confirm the point Grab suggests.'
  }

  return {
    ok: true,
    destination,
    deadlineMs,
    minutesLeft,
    arrivalMs,
    onTime,
    mrt,
    taxi,
    recommended,
    pickup,
    summary: summaryFor({ recommended, chosenMinutes, deadlineMs, minutesLeft, onTime, arrivalMs })
  }
}
