import { CHECKIN } from './config.js'
import { distanceM } from './travel.js'
import { sgParts } from './hours.js'

/**
 * Client mirror of the stamp_place() SQL rules (Kayra's RPC is the source of truth):
 *  - radius 80 m, 120 m when accuracy is poor (> 50 m)
 *  - reject accuracy > 150 m unless fake GPS is on
 *  - one stamp per place per Singapore calendar day
 */
export function radiusFor(accuracy) {
  return accuracy > CHECKIN.poorAccuracyM ? CHECKIN.poorAccuracyRadiusM : CHECKIN.radiusM
}

export function checkInStatus({ place, position, fake = false }) {
  if (!position) return { ok: false, code: 'no_gps', message: 'Waiting for GPS…' }
  const accuracy = position.accuracy ?? 999
  if (accuracy > CHECKIN.rejectAccuracyM && !fake) {
    return { ok: false, code: 'accuracy', message: `GPS too fuzzy (±${Math.round(accuracy)} m). Step outside or wait a moment.` }
  }
  const radius = radiusFor(accuracy)
  const d = distanceM(position, place)
  if (d > radius) return { ok: false, code: 'far', distance: d, radius, message: `${Math.round(d)} m away. Get within ${radius} m to stamp.` }
  return { ok: true, distance: d, radius, message: 'In range. Stamp it!' }
}

export function sameSgDay(aMs, bMs) {
  const a = new Date(aMs + 8 * 3600e3).toISOString().slice(0, 10)
  const b = new Date(bMs + 8 * 3600e3).toISOString().slice(0, 10)
  return a === b
}

export { sgParts }
