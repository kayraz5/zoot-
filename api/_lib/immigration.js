import { ICA_VISA_PAGE } from '../../src/model/services/immigration.js'

// Live sources for /api/entry-rule and `pnpm snapshot:entry`. Each checks the data looks sane,
// so a site redesign fails loudly instead of reading as "nobody needs a visa".

const INDEX_URL = 'https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index-tidy-iso2.csv'
const USER_AGENT = 'Zoot/1.0 (SMU student project, layover planner)'

/** ICA's visa-required countries, as the link names on its visa page (e.g. "india", "south-sudan"). */
export async function fetchIcaSlugs() {
  const res = await fetch(ICA_VISA_PAGE, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`ICA ${res.status}`)
  const html = await res.text()
  const slugs = [...new Set([...html.matchAll(/visa-detail-page\/([a-z0-9-]+)/g)].map((m) => m[1]))].sort()
  if (slugs.length < 20 || slugs.length > 60) throw new Error(`ICA list looks wrong (${slugs.length} countries)`)
  return slugs
}

/** Passport Index rule for entering Singapore, per passport code (e.g. { IN: 'e-visa', US: '30' }). */
export async function fetchIndexRules() {
  const res = await fetch(INDEX_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Passport Index ${res.status}`)
  const rules = {}
  for (const line of (await res.text()).split(/\r?\n/).slice(1)) {
    const [passport, destination, requirement] = line.split(',')
    if (destination === 'SG' && passport) rules[passport] = requirement
  }
  if (Object.keys(rules).length < 150) throw new Error(`Passport Index data looks incomplete (${Object.keys(rules).length} passports)`)
  return rules
}
