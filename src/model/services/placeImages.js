/**
 * Live photos for a place from Wikimedia Commons (and Wikipedia as a fallback).
 * Free, keyless and openly licensed. Every image carries its author + licence for the credit line.
 *
 * getPlaceImages(place) -> Promise<[{ src, full, alt, credit, license, page }]>, up to MAX_IMAGES.
 * Results are cached in localStorage so a mission page doesn't refetch on every visit,
 * and requests run one at a time because Wikimedia rate-limits bursts.
 */

const MAX_IMAGES = 3
// Commons only renders thumbnails at fixed widths (…500, 960, 1280, 1920…); other sizes return 400.
const THUMB_W = 960
const FULL_WIDTHS = [1920, 1280]
const CACHE_KEY = 'zoot.placeImages.v2'
const TTL_MS = 14 * 864e5 // keep hits two weeks
const MISS_TTL_MS = 864e5 // retry places with no photos after a day
const GAP_MS = 350 // pause between requests

// Search terms for places whose name alone finds the wrong photos.
const SEARCH = {
  'changi-point-boardwalk': 'Changi Point Coastal Walk',
  'hong-lim-food-centre': 'Hong Lim Food Centre',
  'supertree-grove': 'Supertree Grove',
  'siloso-beach': 'Siloso Beach',
  'tiong-bahru-estate': 'Tiong Bahru estate'
}

const inflight = new Map()
let queue = Promise.resolve()

export function getPlaceImages(place) {
  if (!place?.id) return Promise.resolve([])
  const cached = readCache()[place.id]
  if (cached && Date.now() - cached.at < (cached.images.length ? TTL_MS : MISS_TTL_MS)) return Promise.resolve(cached.images)
  if (!inflight.has(place.id)) {
    const job = queue.then(() => fetchImages(place)).then(
      (images) => { writeCache(place.id, images); return images },
      () => [] // network/rate-limit failure: show the poster art, don't cache, try again next visit
    ).finally(() => inflight.delete(place.id))
    queue = job.then(() => sleep(GAP_MS))
    inflight.set(place.id, job)
  }
  return inflight.get(place.id)
}

async function fetchImages(place) {
  const images = await fromCommons(place)
  if (images.length < MAX_IMAGES) {
    const lead = await fromWikipedia(place)
    if (lead && !images.some((i) => i.file === lead.file)) images.unshift(lead)
  }
  return images.slice(0, MAX_IMAGES).map(({ file, ...img }) => img)
}

/** Photos geotagged within 1 km, ranked so titles that mention the place come first. */
async function fromCommons(place) {
  const term = SEARCH[place.id] || place.name
  const d = await api('commons.wikimedia.org', {
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '15',
    gsrsearch: `${term} filetype:bitmap nearcoord:1km,${place.lat},${place.lng}`,
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: String(THUMB_W)
  })
  const words = tokens(term)
  return Object.values(d.query?.pages || {})
    .map((pg) => ({ pg, ii: pg.imageinfo?.[0] }))
    .filter(({ pg, ii }) => ii?.thumburl && /\.jpe?g$/i.test(pg.title) && ii.width >= 600 && ii.width / ii.height > 0.6 && ii.width / ii.height < 2.4)
    .map(({ pg, ii }) => ({ pg, ii, score: tokens(pg.title).filter((w) => words.includes(w)).length * 10 - pg.index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_IMAGES)
    .map(({ pg, ii }) => toImage(pg.title, ii, place))
}

/** The lead image of a Wikipedia article whose coordinates sit within 1.5 km of the place. */
async function fromWikipedia(place) {
  const d = await api('en.wikipedia.org', {
    action: 'query', generator: 'search', gsrsearch: `${SEARCH[place.id] || place.name} Singapore`, gsrlimit: '5',
    prop: 'pageimages|coordinates', piprop: 'name'
  })
  const page = Object.values(d.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .find((pg) => pg.pageimage && pg.coordinates?.[0] && distanceKm(place, { lat: pg.coordinates[0].lat, lng: pg.coordinates[0].lon }) <= 1.5)
  if (!page || !/\.jpe?g$/i.test(page.pageimage)) return null
  const title = `File:${page.pageimage}`
  const info = await api('commons.wikimedia.org', { action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: String(THUMB_W) })
  const ii = Object.values(info.query?.pages || {})[0]?.imageinfo?.[0]
  return ii?.thumburl ? toImage(title, ii, place) : null
}

function toImage(title, ii, place) {
  const meta = ii.extmetadata || {}
  // Sharper copy for the lightbox: the biggest allowed width the original can fill (Commons won't upscale).
  const fullW = FULL_WIDTHS.find((w) => ii.width >= w)
  return {
    file: title,
    src: ii.thumburl,
    full: fullW ? ii.thumburl.replace(/\/\d+px-/, `/${fullW}px-`) : ii.url,
    alt: stripHtml(meta.ImageDescription?.value).slice(0, 140) || place.name,
    credit: stripHtml(meta.Artist?.value) || 'Wikimedia Commons',
    license: stripHtml(meta.LicenseShortName?.value),
    page: ii.descriptionurl
  }
}

async function api(host, params) {
  const res = await fetch(`https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', origin: '*', ...params }))
  if (!res.ok) throw new Error(`${host} ${res.status}`)
  return res.json() // a rate-limit reply isn't JSON, so this throws and the caller falls back
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch { return {} }
}

function writeCache(id, images) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), [id]: { at: Date.now(), images } })) } catch { /* storage full or blocked: just skip caching */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const tokens = (s) => s.toLowerCase().replace(/^file:/, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && w !== 'singapore' && w !== 'jpg')

function distanceKm(a, b) {
  const r = (x) => (x * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
