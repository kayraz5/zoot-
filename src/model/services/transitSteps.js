/**
 * Turn a route's `parts` (mrtRoute.js, busRoute.js, /api/transit) into plain-language steps
 * for someone who has never used Singapore transport:
 *   { icon, colour, badge, title, detail, minutes }
 * e.g. "Take the Green line (EW) towards Tuas Link" · "9 stops · get off at City Hall".
 * Also: which part the traveller is on now, from their position.
 */
import { LINES, BUS_HEX, WALK_HEX } from '../data/transitLines.js'
import { projectOnRoute } from './routeGeometry.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const mins = (m) => (m ? ` · ${m} min` : '')

export function lineInfo(code) {
  return LINES[code] || { name: code ? `${code} line` : 'Train', colour: code || 'Train', hex: '#666666' }
}

/** Colour a part is drawn in on the map. */
export function partColour(part) {
  if (part.mode === 'mrt') return lineInfo(part.line).hex
  if (part.mode === 'bus') return BUS_HEX
  return WALK_HEX
}

function walkStep(part, i, parts) {
  const to = part.to || {}
  const nextPart = parts[i + 1]
  if (to.kind === 'station') {
    return {
      icon: 'bi-person-walking',
      title: `Walk to ${to.name} MRT station`,
      detail: [to.exit && `Use Exit ${to.exit}`, nextPart?.mode === 'mrt' && 'Follow the signs for the ' + lineInfo(nextPart.line).colour + ' line'].filter(Boolean).join(' · ') || 'Follow the red-and-white MRT signs'
    }
  }
  if (to.kind === 'bus-stop') {
    return {
      icon: 'bi-person-walking',
      title: `Walk to the bus stop: ${to.name}`,
      detail: [to.code && `Stop ${to.code}`, to.road].filter(Boolean).join(' · ')
    }
  }
  const prev = parts[i - 1]
  return {
    icon: 'bi-flag-fill',
    title: `Walk to ${to.name || 'your stop'}`,
    detail: prev?.mode === 'mrt' && part.from?.exit ? `Leave by Exit ${part.from.exit}` : prev?.mode === 'bus' ? 'Cross at a crossing, not between buses' : ''
  }
}

function rideStep(part, i, parts) {
  const prevRide = parts.slice(0, i).reverse().find((p) => p.mode !== 'walk')
  const changing = prevRide && parts[i - 1]?.mode !== 'walk' // straight from one train to the next
  if (part.mode === 'bus') {
    return {
      icon: 'bi-bus-front-fill',
      colour: BUS_HEX,
      badge: part.service,
      title: `Take bus ${part.service}${part.towards ? ` towards ${part.towards}` : ''}`,
      detail: `${plural(part.stops, 'stop')} · get off at ${part.to?.name}${part.to?.code ? ` (${part.to.code})` : ''} · press the bell before your stop`
    }
  }
  if (part.line === 'SE') {
    return {
      icon: 'bi-train-lightrail-front-fill',
      colour: LINES.SE.hex,
      badge: 'SE',
      title: changing ? 'Change to the Sentosa Express monorail' : 'Take the Sentosa Express monorail',
      detail: `Boards at VivoCity, level 3 · about S$4 by card to get onto the island · get off at ${part.to?.name?.replace(' (Sentosa Express)', '')}`
    }
  }
  const line = lineInfo(part.line)
  const direction = part.towards ? `towards ${part.towards}` : part.nextStop ? `(next stop ${part.nextStop})` : ''
  return {
    icon: 'bi-train-front-fill',
    colour: line.hex,
    badge: part.line,
    title: `${changing ? `Change at ${part.from?.name} to` : 'Take'} the ${line.colour} line ${direction}`.trim(),
    detail: `${plural(part.stops, 'stop')} · get off at ${part.to?.name}`
  }
}

/** One step per part, in the same order, so a part index is also a step index. */
export function transitSteps(parts) {
  if (!parts?.length) return []
  return parts
    .map((part, i) => {
      const step = part.mode === 'walk' ? walkStep(part, i, parts) : rideStep(part, i, parts)
      return { ...step, colour: step.colour || WALK_HEX, minutes: part.minutes ?? null, mode: part.mode, title: step.title + (part.mode === 'walk' ? mins(part.minutes) : '') }
    })
}

/** Index of the part whose line the traveller is closest to (0 when unknown). */
export function currentPartIndex(parts, position) {
  if (!parts?.length || !position) return 0
  let best = 0
  let bestD = Infinity
  parts.forEach((part, i) => {
    const hit = projectOnRoute(part.coords, position)
    // Ties go to the later part: at a station you're at the end of one and the start of the next.
    if (hit && hit.distanceM <= bestD + 5) { best = i; bestD = Math.min(bestD, hit.distanceM) }
  })
  return best
}

/** Map pins for the moments that matter: where to board, change and get off. */
export function transferPoints(parts) {
  const points = []
  parts.forEach((part, i) => {
    if (part.mode === 'walk' || !part.from || !part.to) return
    const prevRide = parts[i - 1]?.mode !== 'walk' && parts[i - 1]
    const what = part.mode === 'bus' ? `Bus ${part.service}` : `${lineInfo(part.line).colour} line`
    points.push({ ...part.from, label: prevRide ? `Change · ${what}` : `Board · ${what}`, colour: partColour(part) })
    const nextRide = parts[i + 1]?.mode !== 'walk' && parts[i + 1]
    if (!nextRide) points.push({ ...part.to, label: `Get off · ${part.to.name}`, colour: partColour(part) })
  })
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
}
