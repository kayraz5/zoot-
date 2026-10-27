/**
 * Small, dependency-free geometry helpers for the live route line.
 *
 * The router returns a polyline for a leg. As the traveller moves, that polyline's
 * origin becomes stale, which used to leave a straight "tail" from the character
 * to the old route start. These helpers project the current position onto the
 * polyline and trim the path ahead of it, so the drawn line always begins exactly
 * at the character without another network request.
 *
 * Distances are computed in a local metre plane (equirectangular approximation).
 * Over a city-scale route that is accurate to a few centimetres per kilometre,
 * which is far below GPS accuracy, and much cheaper than spherical maths per frame.
 */

const METERS_PER_DEG_LAT = 110540
const METERS_PER_DEG_LNG_AT_EQUATOR = 111320

/** Convert a [lng, lat] point to local metres relative to `origin`. */
function toLocalMeters(point, origin) {
  const metersPerDegLng =
    METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180)
  return {
    x: (point[0] - origin.lng) * metersPerDegLng,
    y: (point[1] - origin.lat) * METERS_PER_DEG_LAT
  }
}

/**
 * Nearest point on a polyline to `position`.
 *
 * @param {number[][]} coords  [[lng, lat], …]
 * @param {{ lat: number, lng: number }} position
 * @returns {{ index: number, point: number[], distanceM: number } | null}
 *   `index` is the segment start, `point` the projected [lng, lat].
 */
export function projectOnRoute(coords, position) {
  if (!coords?.length || !position) return null

  if (coords.length === 1) {
    const local = toLocalMeters(coords[0], position)
    return { index: 0, point: coords[0], distanceM: Math.hypot(local.x, local.y) }
  }

  let best = null

  for (let i = 0; i < coords.length - 1; i++) {
    const a = toLocalMeters(coords[i], position)
    const b = toLocalMeters(coords[i + 1], position)

    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy

    // Project the origin (0,0) onto the segment a→b and clamp to the segment.
    let t = lengthSq ? -(a.x * dx + a.y * dy) / lengthSq : 0
    t = Math.max(0, Math.min(1, t))

    const x = a.x + t * dx
    const y = a.y + t * dy
    const distanceSq = x * x + y * y

    if (!best || distanceSq < best.distanceSq) {
      best = {
        index: i,
        distanceSq,
        point: [
          coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
          coords[i][1] + t * (coords[i + 1][1] - coords[i][1])
        ]
      }
    }
  }

  return best && { index: best.index, point: best.point, distanceM: Math.sqrt(best.distanceSq) }
}

/**
 * Trim a route so it starts at the traveller and keeps only the path ahead, and
 * report how far the traveller is from the line (used by the re-route policy).
 * One projection per call, so callers that need both values don't pay twice.
 *
 * Adds a short connector to the projected point when GPS puts the traveller a
 * little off the road; without it the line would start at the old route origin.
 *
 * @param {number[][]} coords  [[lng, lat], …]
 * @param {{ lat: number, lng: number } | null} position
 * @returns {{ coords: number[][], distanceM: number }}
 */
export function trimRouteAtPosition(coords, position) {
  if (!coords?.length) return { coords: [], distanceM: Infinity }
  if (!position) return { coords: coords.slice(), distanceM: 0 }

  const hit = projectOnRoute(coords, position)
  if (!hit) return { coords: coords.slice(), distanceM: Infinity }

  const trimmed = [[position.lng, position.lat]]
  // 1 m of connector is below display resolution but bridges real GPS offset.
  if (hit.distanceM > 1) trimmed.push(hit.point)

  for (let i = hit.index + 1; i < coords.length; i++) {
    const point = coords[i]
    const last = trimmed[trimmed.length - 1]
    // When the projection lands exactly on a vertex, that vertex is already the
    // last point; skip it so the line has no zero-length segment.
    if (point[0] === last[0] && point[1] === last[1]) continue
    trimmed.push(point)
  }
  return { coords: trimmed, distanceM: hit.distanceM }
}

/**
 * Convenience wrapper when only the trimmed geometry is needed.
 * @param {number[][]} coords
 * @param {{ lat: number, lng: number } | null} position
 * @returns {number[][]}
 */
export function trimRouteToPosition(coords, position) {
  return trimRouteAtPosition(coords, position).coords
}

/**
 * How far the traveller is from the resolved route, in metres.
 * Used to decide when a fresh router call is actually needed.
 *
 * @param {number[][]} coords
 * @param {{ lat: number, lng: number } | null} position
 */
export function routeDeviationMeters(coords, position) {
  const hit = projectOnRoute(coords, position)
  return hit ? hit.distanceM : Infinity
}
