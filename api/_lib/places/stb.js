// STB "Tourist Attractions" dataset from data.gov.sg (Singapore Open Data Licence, no key needed)

const DATASET_ID = 'd_0f2f47515425404e6c9d2a040dd87354'
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`

// Listed in the dataset but closed, not a single spot, or not an attraction
const SKIP_TITLES = [/jurong bird park/i, /substation/i, /parkroyal/i, /^shophouses$/i, /^singapore garden/i]

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_PATTERN = '(sun|mon|tues|wednes|thurs|fri|satur)day'
const TIME_PATTERN = '(\\d{1,2})(?:[.:](\\d{2}))?\\s*(am|pm)'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The download link is signed and expires, and the poll endpoint rate-limits, so retry a few times
export async function fetchStbAttractions() {
  let url = null
  for (let attempt = 0; attempt < 5 && !url; attempt++) {
    const res = await fetch(POLL_URL)
    const json = await res.json().catch(() => ({}))
    url = json?.data?.url
    if (!url) await wait(3000)
  }
  if (!url) throw new Error('data.gov.sg did not return a download link')

  const geo = await (await fetch(url)).json()
  return geo.features
    .map((feature) => feature.properties)
    .filter((row) => row.LATITUDE && row.LONGTITUDE)
    .map(toAttraction)
    .filter((attraction) => attraction.name && !SKIP_TITLES.some((re) => re.test(attraction.name)))
}

function toAttraction(row) {
  return {
    ref: `stb:${row.OBJECTID_1}`,
    name: cleanTitle(fixText(row.PAGETITLE)),
    lat: row.LATITUDE,
    lng: row.LONGTITUDE,
    blurb: fixText(row.OVERVIEW || row.META_DESCRIPTION || ''),
    hoursText: fixText(row.OPENING_HOURS || ''),
    website: row.EXTERNAL_LINK || null,
    kind: kindFromStb(row)
  }
}

// The dataset's text is UTF-8 that was decoded as Windows-1252 ("Singaporeâ€™s"), so undo that
const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f }

export function fixText(text) {
  if (!/[ÂÃâ]/.test(text)) return text.replace(/\s+/g, ' ').trim()
  const bytes = []
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (CP1252[char] !== undefined) bytes.push(CP1252[char])
    else if (code < 256) bytes.push(code)
    else return text.replace(/\s+/g, ' ').trim() // not mojibake after all
  }
  return Buffer.from(bytes).toString('utf8').replace(/<[^>]*>?/g, '').replace(/\s+/g, ' ').trim()
}

// "Sri Mariamman Temple: Hindu Temple in Singapore" -> "Sri Mariamman Temple"
export function cleanTitle(title) {
  return title
    .replace(/[®™]/g, '')
    .split(/\s*:\s|\s[–-]\s|[–-]\s/)[0]
    .replace(/,\s+(a|an|the|singapore)\b.*$/i, '')
    .replace(/\s+&\s+.*\b(singapore|museum|islands?)\b.*$/i, '') // "MINT Museum of Toys & Toy Museum"
    .replace(/\s*(landmark)?\s+in singapore$/i, '')
    .replace(/(?<!\bof)\s+singapore$/i, '')
    .replace(/\s+landmark$/i, '')
    .trim()
}

// Rough place type from the title, then STB's URL section
function kindFromStb(row) {
  const path = (row.URL_PATH || '').toLowerCase()
  const title = (row.PAGETITLE || '').toLowerCase()

  if (/places-to-see/.test(path)) return 'district'
  if (/mosque|temple|church|cathedral|synagogue/.test(title)) return 'worship'
  if (/memorial|cenotaph|obelisk|statue|monument|cemetery/.test(title)) return 'memorial'
  if (/museum|gallery|heritage centre|baba house|antique house/.test(title)) return 'museum'
  if (/zoo|safari/.test(title)) return 'zoo'
  if (/aquarium/.test(title)) return 'aquarium'
  if (/universal studios|waterpark|resorts world/.test(title)) return 'themepark'
  if (/beach|east coast park/.test(title)) return 'beach'
  if (/nature reserve|sungei buloh|chek jawa|macritchie|ubin|island/.test(title)) return 'nature'
  if (/nature-wildlife/.test(path)) return 'park'
  if (/flyer|skypark|cable car|bridge|waves|pinnacle/.test(title)) return 'lookout'
  if (/lau pa sat|food street/.test(title)) return 'hawker'
  if (/\/arts/.test(path)) return 'arts'
  return 'landmark'
}

/*
  Opening hours text -> Zoot format ({ hours: [["09:00","17:00"]] | "24h", closed_days: [1] }).
  Returns null when the text is too vague to trust; the caller then uses category defaults.
*/
export function parseStbHours(raw) {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || /appointment|expected to open|vary|varies|differ|renovation|box office|administration office/i.test(text)) return null

  const ranges = [...text.matchAll(new RegExp(`${TIME_PATTERN}\\s*(?:–|-|to)\\s*${TIME_PATTERN}`, 'gi'))]
    .map((m) => [toHHMM(m[1], m[2], m[3]), toHHMM(m[4], m[5], m[6])])

  if (!ranges.length) {
    return /24 hours|all day/i.test(text) ? { hours: '24h', closed_days: [] } : null
  }

  // e.g. "7am – 12pm, and 6pm – 9pm"
  const splitDay = ranges.length === 2 && new RegExp(`${TIME_PATTERN},?\\s+and\\s+${TIME_PATTERN}`, 'i').test(text)
  if (splitDay) return { hours: ranges.map(fixMidnight), closed_days: closedDaysFrom(text) }

  // Many ranges usually means several attractions in one entry, so their day lists can't be trusted
  const closedDays = ranges.length > 2 ? explicitClosedDays(text) : closedDaysFrom(text)

  // Several ranges (different days or attractions): keep only the hours every one of them is open
  const open = Math.max(...ranges.map(([o]) => minutes(o)))
  const close = Math.min(...ranges.map(([o, c]) => closeMinutes(o, c)))
  if (close - open < 60) return null
  return { hours: [fixMidnight([fromMinutes(open), fromMinutes(close % 1440)])], closed_days: closedDays }
}

function explicitClosedDays(text) {
  const days = [...text.matchAll(new RegExp(`closed on ${DAY_PATTERN}`, 'gi'))].map((m) => dayIndex(m[1]))
  return [...new Set(days)]
}

function closedDaysFrom(text) {
  const explicit = explicitClosedDays(text)
  const rest = text.replace(new RegExp(`closed on ${DAY_PATTERN}[^,.]*`, 'gi'), '')
  if (/daily|monday to sunday/i.test(rest)) return explicit

  const covered = new Set()
  for (const m of rest.matchAll(new RegExp(`${DAY_PATTERN}\\s*(?:to|-|–)\\s*${DAY_PATTERN}`, 'gi'))) {
    for (let d = dayIndex(m[1]); ; d = (d + 1) % 7) {
      covered.add(d)
      if (d === dayIndex(m[2])) break
    }
  }
  for (const m of rest.matchAll(new RegExp(`\\b${DAY_PATTERN}\\b`, 'gi'))) covered.add(dayIndex(m[1]))
  if (!covered.size) return explicit
  return [...new Set([...explicit, ...DAYS.map((_, d) => d).filter((d) => !covered.has(d))])].sort()
}

const dayIndex = (name) => DAYS.indexOf(name.slice(0, 3).toLowerCase())
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const closeMinutes = (open, close) => (minutes(close) <= minutes(open) ? minutes(close) + 1440 : minutes(close))
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
// hours.js reads "23:59" as "until midnight"
const fixMidnight = ([open, close]) => [open, close === '00:00' ? '23:59' : close]

function toHHMM(hour, minute = '00', ampm) {
  let h = Number(hour) % 12
  if (ampm.toLowerCase() === 'pm') h += 12
  return `${String(h).padStart(2, '0')}:${(minute || '00').padStart(2, '0')}`
}
