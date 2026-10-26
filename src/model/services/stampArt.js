import stampFiles from 'virtual:stamps'
import { AREAS } from '../data/origins.js'

/**
 * Per-location stamp art.
 *
 * The PNGs live in public/stamps and are named after the place, e.g.
 * `ArtScience_Museum.png`. `virtual:stamps` (Vite plugin in vite.config.js) lists
 * the folder at build time, so this module can match a place to its file by name
 * — there is no hand-written place→file table to maintain.
 *
 * Matching is deliberately conservative, in this order:
 *   1. exact normalised name (`St Andrew's Cathedral` → `St_Andrews_Cathedral`)
 *   2. one name is a prefix of the other (`Mount Faber Peak` → `Mount_Faber`)
 *   3. one set of meaningful words contains the other
 *      (`Sun Yat Sen Nanyang Memorial Hall` → `Sun_Yat_Sen_Memorial_Hall`)
 *
 * Area-level files (`Chinatown.png`, `Marina_Bay.png`, …) are excluded from place
 * matching so "Chinatown Complex Food Centre" cannot borrow the district stamp.
 * Places without art fall back to the drawn chop in pageArt/StampCelebration.
 */

const STOP_WORDS = new Set(['the', 'a', 'an', 'at', 'of', 'and', 'on', 'in'])

/** Normalise a display name or filename to a comparison key. */
export function stampKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’‘'`]/g, '')
    .replace(/[@#\-–—_/.,:;!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words that carry meaning (stop words such as "at" and "the" are ignored). */
function meaningfulWords(key) {
  return new Set(key.split(' ').filter((word) => word && !STOP_WORDS.has(word)))
}

/** Keys worth trying for a name: as written, without "the", without "(…)". */
function nameVariants(name) {
  const raw = String(name || '')
  const withoutParens = raw.replace(/\s*\([^)]*\)\s*/g, ' ')
  const variants = new Set()

  for (const value of [raw, withoutParens]) {
    const key = stampKey(value)
    if (!key) continue
    variants.add(key)
    if (key.startsWith('the ')) variants.add(key.slice(4))
  }

  return [...variants]
}

const STAMP_FILES = stampFiles.map((file) => ({
  file,
  key: stampKey(file.replace(/\.png$/i, ''))
}))

// District/city stamps are useful for the area page but must not be borrowed by
// an individual place whose name merely starts with the area name.
const AREA_KEYS = new Set(AREAS.map((area) => stampKey(area.id)))
const PLACE_FILES = STAMP_FILES.filter((entry) => !AREA_KEYS.has(entry.key))

function findFile(name, entries) {
  if (!name || !entries.length) return null
  const variants = nameVariants(name)

  // 1. Exact name (including the "the"-less and parenthetical-free variants).
  for (const variant of variants) {
    const exact = entries.find((entry) => entry.key === variant)
    if (exact) return exact
  }

  // 2. Prefix: "mount faber peak" ↔ "mount faber".
  for (const variant of variants) {
    const candidates = entries
      .filter((entry) => variant.startsWith(entry.key + ' ') || entry.key.startsWith(variant + ' '))
      .sort((a, b) => Math.abs(a.key.length - variant.length) - Math.abs(b.key.length - variant.length))
    if (candidates.length) return candidates[0]
  }

  // 3. One set of meaningful words contains the other (ignores "at", "the", …).
  for (const variant of variants) {
    const variantWords = meaningfulWords(variant)
    if (!variantWords.size) continue

    const candidates = entries
      .filter((entry) => {
        const fileWords = meaningfulWords(entry.key)
        if (!fileWords.size) return false
        return (
          [...fileWords].every((word) => variantWords.has(word)) ||
          [...variantWords].every((word) => fileWords.has(word))
        )
      })
      .sort(
        (a, b) =>
          Math.abs(meaningfulWords(a.key).size - variantWords.size) -
          Math.abs(meaningfulWords(b.key).size - variantWords.size)
      )
    if (candidates.length) return candidates[0]
  }

  return null
}

/**
 * Match a name against an explicit list of PNG filenames.
 * Exported for tests; production callers use placeStampFile/areaStampFile.
 */
export function matchStampName(name, fileNames) {
  const entries = (fileNames || []).map((file) => ({
    file,
    key: stampKey(file.replace(/\.png$/i, ''))
  }))
  return findFile(name, entries)?.file || null
}

/** Filename (e.g. `ArtScience_Museum.png`) for a place, or null. */
export function placeStampFile(name) {
  return findFile(name, PLACE_FILES)?.file || null
}

// URL lookups run inside templates and canvas repaints; remember the result.
const placeUrlCache = new Map()
const areaUrlCache = new Map()

/** Public URL for a place's stamp PNG, or null. */
export function placeStampUrl(name) {
  const cacheKey = String(name || '')
  if (placeUrlCache.has(cacheKey)) return placeUrlCache.get(cacheKey)

  const file = placeStampFile(name)
  const url = file ? `/stamps/${encodeURIComponent(file)}` : null
  placeUrlCache.set(cacheKey, url)
  return url
}

// A stamp named "<Area> <place-type>" can stand in for the district (Orchard_Road,
// Sentosa_Island, East_Coast_Park), but a specific venue cannot (Changi_Museum).
const AREA_SUFFIXES = new Set([
  'road', 'island', 'park', 'district', 'bay', 'beach', 'river', 'ridges', 'harbour'
])

/** Filename for an area's chop art, or null when the area has no suitable stamp. */
export function areaStampFile(areaId) {
  const key = stampKey(areaId)
  if (!key) return null

  const exact = STAMP_FILES.find((entry) => entry.key === key)
  if (exact) return exact.file

  const extended = STAMP_FILES.find((entry) => {
    if (!entry.key.startsWith(key + ' ')) return false
    const suffix = entry.key.slice(key.length + 1).split(' ').at(-1)
    return AREA_SUFFIXES.has(suffix)
  })
  return extended?.file || null
}

/** Public URL for an area's chop art, or null. */
export function areaStampUrl(areaId) {
  const cacheKey = String(areaId || '')
  if (areaUrlCache.has(cacheKey)) return areaUrlCache.get(cacheKey)

  const file = areaStampFile(areaId)
  const url = file ? `/stamps/${encodeURIComponent(file)}` : null
  areaUrlCache.set(cacheKey, url)
  return url
}

// ── Image cache (canvas pages need loaded HTMLImageElements) ────────────────

const imageCache = new Map() // url → { image, promise }

/** Load a stamp image once; resolves null if the file cannot be decoded. */
export function loadStampImage(url) {
  if (!url) return Promise.resolve(null)

  let entry = imageCache.get(url)
  if (!entry) {
    const image = new Image()
    image.decoding = 'async'
    const promise = new Promise((resolve) => {
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = url
    })
    entry = { image, promise }
    imageCache.set(url, entry)
  }

  return entry.promise
}

/** Synchronous accessor for canvas drawing; null until the preload resolves. */
export function loadedStampImage(url) {
  if (!url) return null
  const entry = imageCache.get(url)
  return entry?.image.complete && entry.image.naturalWidth ? entry.image : null
}

/**
 * Preload every stamp these places/areas need. Repeat calls are cheap (cached).
 * @param {Array<object|string>} places  place objects or names
 * @param {Array<object|string>} areas   area objects or ids
 */
export async function preloadStampImages(places = [], areas = []) {
  const urls = new Set()

  for (const place of places) {
    const url = placeStampUrl(typeof place === 'string' ? place : place?.name)
    if (url) urls.add(url)
  }
  for (const area of areas) {
    const url = areaStampUrl(typeof area === 'string' ? area : area?.id)
    if (url) urls.add(url)
  }

  await Promise.all([...urls].map(loadStampImage))
}
