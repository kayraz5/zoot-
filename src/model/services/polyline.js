/**
 * Decode a Google-style encoded polyline (precision 5) into [[lng, lat], …].
 * Used for bus route lines (busrouter data) and OneMap transit legs.
 */
export function decodePolyline(str, precision = 5) {
  const factor = 10 ** precision
  const coords = []
  let lat = 0
  let lng = 0
  let i = 0
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0
      let result = 0
      let byte
      do {
        byte = str.charCodeAt(i++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    coords.push([lng / factor, lat / factor])
  }
  return coords
}
