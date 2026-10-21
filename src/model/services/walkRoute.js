/**
 * Street-following walking routes with turn-by-turn steps, from the public OSRM foot router
 * (routing.openstreetmap.de, run by FOSSGIS: free, keyless, OpenStreetMap data).
 *
 * getWalkRoute(from, to) -> Promise<{ coords: [[lng, lat]…], distance_m, steps: [{ text, icon, name, distance_m, at: { lat, lng } }] } | null>
 * Returns null when the router is down or slow; callers then draw a straight line instead.
 */

const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'
const TIMEOUT_MS = 6000
const cache = new Map()

export function getWalkRoute(from, to) {
  const key = [from.lng, from.lat, to.lng, to.lat].map((n) => n.toFixed(5)).join(',')
  if (!cache.has(key)) {
    const job = fetchRoute(from, to).catch(() => {
      cache.delete(key) // don't remember failures, try again next time
      return null
    })
    cache.set(key, job)
  }
  return cache.get(key)
}

async function fetchRoute(from, to) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url = `${ROUTER}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`router ${res.status}`)
    const route = (await res.json()).routes?.[0]
    if (!route) throw new Error('no route')
    return {
      coords: route.geometry.coordinates,
      distance_m: route.distance,
      steps: route.legs[0].steps.map((s) => ({
        ...describe(s.maneuver, s.name),
        name: s.name,
        distance_m: s.distance,
        at: { lng: s.maneuver.location[0], lat: s.maneuver.location[1] }
      }))
    }
  } finally {
    clearTimeout(timer)
  }
}

const ICONS = {
  left: 'bi-arrow-left', 'sharp left': 'bi-arrow-left', 'slight left': 'bi-arrow-up-left',
  right: 'bi-arrow-right', 'sharp right': 'bi-arrow-right', 'slight right': 'bi-arrow-up-right',
  straight: 'bi-arrow-up', uturn: 'bi-arrow-return-left'
}

/** OSRM maneuver -> short instruction like "Turn left onto Seng Poh Road". */
function describe({ type, modifier }, name) {
  const onto = name ? ` onto ${name}` : ''
  if (type === 'depart') return { text: `Head off${name ? ' along ' + name : ''}`, icon: 'bi-person-walking' }
  if (type === 'arrive') return { text: 'Arrive at the stop', icon: 'bi-flag-fill' }
  if (type === 'roundabout' || type === 'rotary') return { text: `Go round the roundabout${onto}`, icon: 'bi-arrow-repeat' }
  const icon = ICONS[modifier] || 'bi-arrow-up'
  if (!modifier || modifier === 'straight') return { text: `Continue straight${onto}`, icon }
  if (modifier === 'uturn') return { text: `Make a U-turn${onto}`, icon }
  const verb = type === 'fork' ? 'Keep' : 'Turn'
  return { text: `${verb} ${modifier}${onto}`, icon }
}
