import { entryStatus, icaLink, countryName } from '../src/model/services/immigration.js'
import snapshot from '../src/model/data/sgEntrySnapshot.js'
import { fetchIcaSlugs, fetchIndexRules } from './_lib/immigration.js'

/**
 * GET /api/entry-rule?passport=IN — can this passport leave Changi on a layover?
 * Reads ICA's visa list and the Passport Index live (Vercel's CDN caches each answer for a day),
 * and falls back to the saved snapshot if either can't be reached.
 */
const DAY_MS = 24 * 3600e3
const RETRY_MS = 10 * 60e3 // after a failed fetch, try the live sources again in 10 minutes

let live = null // { at, ica, index } while this function instance stays warm

async function liveSources() {
  if (live && Date.now() - live.at < (live.failed ? RETRY_MS : DAY_MS)) return live
  const [ica, index] = await Promise.allSettled([fetchIcaSlugs(), fetchIndexRules()])
  const errors = [ica, index].filter((r) => r.status === 'rejected').map((r) => r.reason.message)
  if (errors.length) console.warn('[entry-rule] using the saved snapshot:', errors.join('; '))
  live = { at: Date.now(), failed: errors.length > 0, ica: ica.value || null, index: index.value || null }

  // Changes to ICA's list mean the saved snapshot and the VFTF rules in immigration.js need a look
  if (live.ica) {
    const added = live.ica.filter((s) => !snapshot.ica.slugs.includes(s))
    const removed = snapshot.ica.slugs.filter((s) => !live.ica.includes(s))
    if (added.length || removed.length) console.warn(`[entry-rule] ICA visa list changed: +${added.join(', ') || '-'} / -${removed.join(', ') || '-'}`)
  }
  return live
}

export default async function handler(req, res) {
  const code = String(new URL(req.url, 'http://localhost').searchParams.get('passport') || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return res.status(400).json({ error: 'passport must be a 2-letter country code' })

  const sources = await liveSources()
  const icaSlugs = sources.ica || snapshot.ica.slugs
  const rules = sources.index || snapshot.index.rules
  if (!(code in rules) && code !== 'SG') return res.status(404).json({ error: `no entry rules for ${code}` })

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({
    passport: code,
    country: countryName(code),
    status: entryStatus(code, { icaSlugs, indexRule: rules[code] }),
    link: icaLink(code, icaSlugs),
    // When the answer was checked against ICA: live today, or the snapshot's date
    checkedOn: sources.ica ? new Date(sources.at).toISOString().slice(0, 10) : snapshot.ica.checkedOn,
    live: Boolean(sources.ica && sources.index)
  })
}
