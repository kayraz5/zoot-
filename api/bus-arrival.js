/**
 * GET /api/bus-arrival?code=01012 — live arrivals at one bus stop:
 *   { services: [{ no, mins: [3, 11, 19], load: 'SEA'|'SDA'|'LSD' }] }  (mins may be empty)
 *
 * Uses LTA DataMall when LTA_ACCOUNT_KEY is set (free: https://datamall.lta.gov.sg), else
 * arrivelah (cheeaun's public mirror of the same feed), so it works with no setup.
 */
const TIMEOUT_MS = 6000

async function fetchJson(url, headers) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal })
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const minsUntil = (iso) => (iso ? Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000)) : null)
const present = (n) => n != null

async function fromDataMall(code) {
  const json = await fetchJson(
    `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${code}`,
    { AccountKey: process.env.LTA_ACCOUNT_KEY, accept: 'application/json' }
  )
  return (json.Services || []).map((s) => ({
    no: s.ServiceNo,
    mins: [s.NextBus, s.NextBus2, s.NextBus3].map((b) => minsUntil(b?.EstimatedArrival)).filter(present),
    load: s.NextBus?.Load || null
  }))
}

async function fromArrivelah(code) {
  const json = await fetchJson(`https://arrivelah2.busrouter.sg/?id=${code}`)
  return (json.services || []).map((s) => ({
    no: s.no,
    mins: [s.next, s.next2, s.next3].map((b) => minsUntil(b?.time)).filter(present),
    load: s.next?.load || null
  }))
}

export default async function handler(req, res) {
  const code = new URL(req.url, 'http://x').searchParams.get('code') || ''
  if (!/^\d{5}$/.test(code)) return res.status(400).json({ error: 'code must be a 5-digit bus stop code' })
  try {
    const services = process.env.LTA_ACCOUNT_KEY ? await fromDataMall(code) : await fromArrivelah(code)
    services.sort((a, b) => a.no.localeCompare(b.no, 'en', { numeric: true }))
    res.setHeader('Cache-Control', 's-maxage=20')
    return res.status(200).json({ services })
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) })
  }
}
