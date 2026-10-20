// OpenStreetMap places via the Overpass API (free, no key; data © OpenStreetMap contributors, ODbL)

// Public Overpass servers get busy; try the next one on failure
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]
// Wikimedia and Overpass ask callers to identify themselves with a way to reach them
const USER_AGENT = 'ZootLayoverApp/1.0 (https://github.com/kayraz5/zoot-; SMU IS216 student project)'

export const OSM_QUERY = `[out:json][timeout:90];
area["ISO3166-1"="SG"][admin_level=2]->.sg;
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"](area.sg);
  nwr["historic"~"^(memorial|monument|fort|building)$"]["name"](area.sg);
  nwr["amenity"="food_court"]["name"](area.sg);
  nwr["amenity"="place_of_worship"]["name"]["wikidata"](area.sg);
  nwr["leisure"~"^(park|nature_reserve|garden)$"]["name"]["wikidata"](area.sg);
);
out center tags;`

const HAWKER_NAME = /hawker|food cent(re|er)|market/i
const FOOD_COURT_CHAIN = /happy hawkers|kim san leng|koufu|kopitiam|food junction|food republic|coffee ?shop/i
const GENERIC_NAME = /^(bunker|food court|canteen|toilets?|shelter|playground|market hall|gun emplacement.*)$|future site/i

export async function fetchOsmPlaces() {
  const json = await overpass(OSM_QUERY)
  return json.elements
    .map(toPlace)
    .filter(Boolean)
}

// A busy server can take ~100 s, so 2 tries of up to 130 s each (fits the 5 minute cron limit)
async function overpass(query) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(130000)
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

function toPlace(element) {
  const tags = element.tags || {}
  const name = (tags['name:en'] || tags.name || '').trim()
  const lat = element.lat ?? element.center?.lat
  const lng = element.lon ?? element.center?.lon
  if (!name || lat == null || lng == null) return null

  const kind = kindFromTags(tags, name)
  if (!kind) return null

  return {
    ref: `osm:${element.type}/${element.id}`,
    name,
    lat,
    lng,
    kind,
    website: tags.website || tags['contact:website'] || null,
    wikipedia: tags.wikipedia || null,
    wikidata: tags.wikidata || null,
    hoursText: tags.opening_hours || '',
    preciseCoords: true,
    enrichOnly: GENERIC_NAME.test(name) || !worthAdding(kind, tags)
  }
}

// Is this a place a traveller would visit, not a bench or a suburban church? (Non-notable ones still fix STB coordinates.)
function worthAdding(kind, tags) {
  if (['museum', 'zoo', 'aquarium', 'themepark', 'hawker'].includes(kind)) return true
  if (kind === 'worship') return Boolean(tags.wikipedia || tags.tourism)
  if (kind === 'arts') return Boolean(tags.wikipedia || tags.wikidata)
  return Boolean(tags.wikidata || tags.wikipedia || tags.website || tags.opening_hours)
}

function kindFromTags(tags, name) {
  if (tags.amenity === 'food_court') return HAWKER_NAME.test(name) && !FOOD_COURT_CHAIN.test(name) ? 'hawker' : null
  if (tags.tourism === 'museum') return 'museum'
  if (tags.tourism === 'gallery') return 'arts'
  if (tags.tourism === 'viewpoint') return 'lookout'
  if (tags.tourism === 'zoo') return 'zoo'
  if (tags.tourism === 'aquarium') return 'aquarium'
  if (tags.tourism === 'theme_park') return 'themepark'
  if (tags.amenity === 'place_of_worship') return 'worship'
  if (tags.historic === 'memorial' || tags.historic === 'monument') return 'memorial'
  if (tags.leisure === 'nature_reserve') return 'nature'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  if (tags.historic) return 'landmark'
  if (tags.tourism === 'attraction') return 'landmark'
  return null
}

/*
  OSM opening_hours -> Zoot format. Handles the common forms:
  "08:30-18:00", "24/7", "Mo-Su 07:00-21:00", "Tu-Su 09:00-18:00; Mo off", "Mo-Fr 09:00-17:00; Sa,Su 10:00-17:00".
  Anything fancier (public holidays, months, sunrise) returns null.
*/
const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function parseOsmHours(raw) {
  const text = (raw || '').trim()
  if (!text) return null
  if (text === '24/7') return { hours: '24h', closed_days: [] }
  if (/PH|SH|sunrise|sunset|[A-Z][a-z]{2} \d|"|week/.test(text)) return null

  const openDays = new Set()
  const ranges = []
  for (const rule of text.split(';').map((r) => r.trim()).filter(Boolean)) {
    const match = rule.match(/^(?:([A-Za-z,\- ]+?)\s+)?((?:\d{2}:\d{2}-\d{2}:\d{2},?\s*)+|off|closed)$/)
    if (!match) return null
    const [, dayPart, timePart] = match
    const days = dayPart ? expandDays(dayPart) : OSM_DAYS.map((_, i) => i)
    if (!days) return null
    if (/off|closed/.test(timePart)) continue
    days.forEach((d) => openDays.add(d))
    ranges.push(timePart.split(',').map((t) => t.trim().split('-')))
  }
  if (!ranges.length) return null

  const closedDays = OSM_DAYS.map((_, i) => i).filter((d) => !openDays.has(d))
  if (ranges.length === 1) return { hours: ranges[0].map(fixClose), closed_days: closedDays }

  // Different hours on different days: keep the window that's open on all of them
  const open = Math.max(...ranges.map((r) => toMinutes(r[0][0])))
  const close = Math.min(...ranges.map((r) => closeMinutes(r[r.length - 1])))
  if (close - open < 60) return null
  return { hours: [fixClose([fromMinutes(open), fromMinutes(close % 1440)])], closed_days: closedDays }
}

function expandDays(part) {
  const days = new Set()
  for (const piece of part.split(',').map((p) => p.trim())) {
    const [from, to] = piece.split('-').map((d) => OSM_DAYS.indexOf(d.trim()))
    if (from < 0 || (to !== undefined && to < 0)) return null
    if (to === undefined) {
      days.add(from)
      continue
    }
    for (let d = from; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === to) break
    }
  }
  return [...days]
}

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const closeMinutes = ([open, close]) => (toMinutes(close) <= toMinutes(open) ? toMinutes(close) + 1440 : toMinutes(close))
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
// hours.js reads "23:59" as "until midnight"
const fixClose = ([open, close]) => [open, close === '24:00' || close === '00:00' ? '23:59' : close]

/** Short description from the place's English Wikipedia article (first two sentences). */
export async function addWikipediaBlurbs(items, cachedBlurbs = new Map()) {
  const candidates = items.filter((item) => !item.enrichOnly)
  for (const item of candidates) {
    if (cachedBlurbs.has(item.ref)) item.blurb = cachedBlurbs.get(item.ref)
  }

  const todo = candidates.filter((item) => !item.blurb)
  // Many link to a Malay/Tamil/Chinese article; Wikidata knows the English one
  await addTitlesFromWikidata(todo.filter((item) => !item.wikipedia?.startsWith('en:') && item.wikidata))

  // Wikipedia rate-limits one-by-one requests, so ask for 20 intros at a time
  const withArticle = todo.filter((item) => item.wikipedia?.startsWith('en:'))
  for (let i = 0; i < withArticle.length; i += 20) {
    const batch = withArticle.slice(i, i + 20)
    try {
      const extracts = await fetchIntros(batch.map((item) => item.wikipedia.slice(3)))
      for (const item of batch) {
        const blurb = shortBlurb(extracts.get(item.wikipedia.slice(3)) || '')
        // Some places link to a broader article (the whole town), so the text must mention the place
        if (blurb && mentionsName(blurb, item.name)) item.blurb = blurb
      }
    } catch {
      // No descriptions for this batch; those places get a generic one
    }
  }
  return items
}

// title -> plain-text intro, following Wikipedia's title normalisation and redirects
async function fetchIntros(titles) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    exintro: 1,
    explaintext: 1,
    exlimit: 20,
    redirects: 1,
    format: 'json',
    formatversion: 2,
    titles: titles.join('|')
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000)
  })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const { query = {} } = await res.json()

  const renamed = new Map([...(query.normalized || []), ...(query.redirects || [])].map((r) => [r.from, r.to]))
  const byTitle = new Map((query.pages || []).map((page) => [page.title, page.extract || '']))
  const result = new Map()
  for (const title of titles) {
    let finalTitle = title
    while (renamed.has(finalTitle)) finalTitle = renamed.get(finalTitle)
    result.set(title, byTitle.get(finalTitle) || '')
  }
  return result
}

const NAME_FILLER = new Set(['the', 'of', 'and', 'park', 'mosque', 'masjid', 'church', 'temple', 'museum', 'centre', 'singapore'])

function mentionsName(text, name) {
  const lower = text.toLowerCase()
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !NAME_FILLER.has(w))
  return words.length === 0 || words.some((w) => lower.includes(w))
}

// Whole sentences up to ~280 characters; a very long first sentence is cut at a word
function shortBlurb(extract) {
  const clean = extract.replace(/\s*\([^()]*:[^()]*\)/g, '') // "(IPA: ...)", "(Chinese: ...)"
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) || []
  let blurb = ''
  for (const sentence of sentences) {
    if (blurb && (blurb + sentence).length > 280) break
    blurb += sentence
  }
  blurb = blurb.trim()
  if (blurb.length > 320) blurb = blurb.slice(0, 300).replace(/\s+\S*$/, '') + '…'
  return blurb || null
}

// Most OSM places only link to Wikidata; look up their English Wikipedia title, 50 at a time
async function addTitlesFromWikidata(items) {
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50)
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: batch.map((item) => item.wikidata).join('|'),
      props: 'sitelinks',
      sitefilter: 'enwiki',
      format: 'json'
    })
    try {
      const res = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000)
      })
      const json = await res.json()
      for (const item of batch) {
        const title = json.entities?.[item.wikidata]?.sitelinks?.enwiki?.title
        if (title) item.wikipedia = `en:${title}`
      }
    } catch {
      // Skip this batch; those places get a generic description
    }
  }
}
