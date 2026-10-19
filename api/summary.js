import { groqConfig, groqJson, tooLarge } from './_lib/groq.js'

/**
 * POST /api/summary — Groq summarises the stored blurb + curated captions for
 * the place page (Hulbert's lane). No live scraping; only facts we send.
 */
const SYSTEM = `You write short place summaries for travellers on a layover in Singapore.
Use ONLY the facts provided (blurb, captions, tags, hours, safety_notes). Do not add facts, prices or opening times that are not given.
Reply with JSON: {"summary":"<= 60 words, second person, warm and practical","tips":["<= 16 words","<= 16 words"]}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { key } = groqConfig()
  if (!key) return res.status(503).json({ error: 'GROQ_API_KEY is not set' })
  if (tooLarge(req.body, 6000)) return res.status(413).json({ error: 'payload too large' })
  const p = req.body?.place
  if (!p?.name) return res.status(400).json({ error: 'place required' })
  try {
    const { model, data } = await groqJson({
      system: SYSTEM,
      user: { name: p.name, area: p.area, tags: p.tags, blurb: p.blurb, captions: p.captions || [], hours: p.hours, safety_notes: p.safety_notes || '' },
      temperature: 0.5,
      maxTokens: 600
    })
    const summary = typeof data.summary === 'string' ? data.summary.slice(0, 600) : ''
    const tips = Array.isArray(data.tips) ? data.tips.filter((t) => typeof t === 'string').slice(0, 3) : []
    if (!summary) return res.status(502).json({ error: 'empty summary' })
    return res.status(200).json({ model, summary, tips })
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) })
  }
}
