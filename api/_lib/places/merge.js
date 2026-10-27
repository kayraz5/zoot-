import { AREAS } from '../../../src/model/data/origins.js'
import { parseOsmHours } from './osm.js'

// Defaults per place kind. Hours here are a guess (outdoor parks, landmarks and memorials have no gate) and get flagged hours_verified: false.
const PROFILES = {
  museum: { label: 'A museum', tags: ['museum', 'culture'], indoor: true, duration_min: 60, cost_band: 1, hours: [['10:00', '18:00']] },
  arts: { label: 'An arts space', tags: ['art', 'culture'], indoor: true, duration_min: 45, cost_band: 1, hours: [['11:00', '18:00']] },
  worship: { label: 'A place of worship', tags: ['heritage', 'culture', 'temple'], indoor: true, duration_min: 30, cost_band: 0, hours: [['09:00', '17:00']] },
  memorial: { label: 'A memorial', tags: ['heritage', 'photo'], indoor: false, duration_min: 20, cost_band: 0, hours: '24h' },
  landmark: { label: 'A landmark', tags: ['architecture', 'photo', 'heritage'], indoor: false, duration_min: 30, cost_band: 0, hours: '24h' },
  park: { label: 'A park', tags: ['nature', 'gardens', 'photo'], indoor: false, duration_min: 45, cost_band: 0, hours: '24h' },
  nature: { label: 'A nature spot', tags: ['nature', 'views'], indoor: false, duration_min: 90, cost_band: 0, hours: [['07:00', '18:30']], min_window_h: 8 },
  lookout: { label: 'A viewpoint', tags: ['views', 'photo'], indoor: false, duration_min: 30, cost_band: 1, hours: [['09:00', '21:00']] },
  zoo: { label: 'A wildlife park', tags: ['nature', 'family'], indoor: false, duration_min: 150, cost_band: 3, hours: [['09:00', '17:30']], min_window_h: 10 },
  aquarium: { label: 'An aquarium', tags: ['family'], indoor: true, duration_min: 120, cost_band: 3, hours: [['10:00', '17:00']], min_window_h: 8 },
  themepark: { label: 'A theme park', tags: ['family', 'rides'], indoor: false, duration_min: 180, cost_band: 3, hours: [['10:00', '18:00']], min_window_h: 12 },
  hawker: { label: 'A hawker centre', tags: ['hawker', 'food'], indoor: true, duration_min: 45, cost_band: 0, hours: [['08:00', '21:00']] }
}

// A seed point can sit at an entrance while OSM uses the centre, so similar names can match further apart
const MATCH_RADIUS_M = 700
const SAME_SPOT_M = 40
const SAME_NAME_RADIUS_M = 3000

/**
 * Seed + OpenStreetMap -> one place list. Seed places are never changed.
 * Places that drop out of OSM are kept as active: false, so old stamps still point somewhere.
 */
export function mergePlaces({ seed, osm, previous = [] }) {
  const centres = areaCentres(seed)
  const previousByRef = new Map(previous.filter((p) => p.source_ref).map((p) => [p.source_ref, p]))
  const places = seed.map((p) => ({ ...p, source: 'seed', active: p.active !== false })) // a seed place switched off in the table stays off
  const seedIds = new Set(places.map((p) => p.id))
  const usedIds = new Set([...places, ...previous].map((p) => p.id))
  const addedRefs = new Set()

  // Places from last run first so their ids stay put, then the well-known and bigger ones,
  // so a maze inside a park can't block the park itself
  const rank = (item) => [previousByRef.get(item.ref)?.active === false || !previousByRef.has(item.ref), !item.blurb, OSM_TYPE_RANK[osmType(item)]]
  const order = (a, b) => rank(a).reduce((diff, x, i) => diff || Number(x) - Number(rank(b)[i]), 0)

  for (const item of [...osm].sort(order)) {
    if (addedRefs.has(item.ref) || places.some((p) => isSamePlace(p, item))) continue
    const place = fromOsm(item, nearestArea(item, centres))
    place.id = previousByRef.get(item.ref)?.id || uniqueId(place, usedIds)
    usedIds.add(place.id)
    addedRefs.add(item.ref)
    places.push(place)
  }

  for (const old of previous) {
    if (seedIds.has(old.id) || old.source === 'seed' || addedRefs.has(old.source_ref)) continue
    places.push({ ...old, active: false })
  }

  return places
}

const OSM_TYPE_RANK = { relation: 0, way: 1, node: 2 }
const osmType = (item) => item.ref.split(':')[1].split('/')[0]

function fromOsm(item, area) {
  const profile = PROFILES[item.kind] || PROFILES.landmark
  const parsed = parseOsmHours(item.hoursText)
  return baseFields(item, area, profile, {
    source: 'osm',
    blurb: item.blurb || `${profile.label} in ${area}.`,
    blurb_source: item.blurb ? 'wikipedia' : null,
    hours: parsed ? parsed.hours : profile.hours,
    closed_days: parsed ? parsed.closed_days : [],
    hours_verified: Boolean(parsed)
  })
}

function baseFields(item, area, profile, extra) {
  const place = {
    id: null,
    name: item.name,
    area,
    lat: round(item.lat),
    lng: round(item.lng),
    tags: [...profile.tags],
    duration_min: profile.duration_min,
    cost_band: profile.cost_band,
    indoor: profile.indoor,
    captions: [],
    website: item.website || null,
    source_ref: item.ref,
    active: true,
    ...extra
  }
  if (profile.min_window_h) place.min_window_h = profile.min_window_h
  return place
}

// Same place if very close, close with a similar name, or the same name a little further off (big parks)
function isSamePlace(place, item) {
  const d = distanceM(place, item)
  if (d <= SAME_SPOT_M) return true
  if (d <= SAME_NAME_RADIUS_M && place.name.toLowerCase() === item.name.toLowerCase()) return true
  return d <= MATCH_RADIUS_M && similarNames(place.name, item.name)
}

const STOP_WORDS = new Set(['the', 'singapore', 'of', 'and', 'at', 'park', 'museum', 'centre', 'center'])

function nameTokens(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
}

function similarNames(a, b) {
  const ta = new Set(nameTokens(a))
  const tb = new Set(nameTokens(b))
  if (!ta.size || !tb.size) return a.toLowerCase() === b.toLowerCase()
  const shared = [...ta].filter((t) => tb.has(t)).length
  return shared / Math.min(ta.size, tb.size) >= 0.5
}

// Centre of each passport area, averaged from the seed places in it
function areaCentres(seed) {
  return AREAS.map((area) => {
    const inArea = seed.filter((p) => p.area === area.id)
    if (!inArea.length) return null
    return {
      id: area.id,
      lat: inArea.reduce((sum, p) => sum + p.lat, 0) / inArea.length,
      lng: inArea.reduce((sum, p) => sum + p.lng, 0) / inArea.length
    }
  }).filter(Boolean)
}

function nearestArea(place, centres) {
  let best = centres[0]
  for (const centre of centres) {
    if (distanceM(place, centre) < distanceM(place, best)) best = centre
  }
  return best.id
}

function uniqueId(place, usedIds) {
  const base = slugify(place.name) || 'place'
  if (!usedIds.has(base)) return base
  const withArea = `${base}-${slugify(place.area)}`
  if (!usedIds.has(withArea)) return withArea
  let n = 2
  while (usedIds.has(`${withArea}-${n}`)) n++
  return `${withArea}-${n}`
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function distanceM(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

const round = (n) => Math.round(n * 1e5) / 1e5
