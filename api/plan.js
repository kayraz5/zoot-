import { groqConfig, groqJson, tooLarge } from './_lib/groq.js'

/**
 * POST /api/plan — Groq chooses places and writes copy. It never outputs minutes
 * or coordinates; the client validates the reply (zoot.choice.v1) and times
 * every leg with Turf + the MRT matrix. Any failure → client falls back.
 */
const SYSTEM = `You are the itinerary chooser for Zoot, a layover side-quest app in Singapore.
The traveller has a HARD return deadline. The app computes all travel and stay times; you only choose places and write copy.

Rules:
- Choose 3 to 6 place ids ONLY from the "catalog" array in the user message. Never invent ids, names or coordinates.
- Match the traveller's interests and style. Budget prefers cost_band 0-1 and hawkers; adventurous prefers views and nature; party prefers nightlife and food; conservative prefers indoor, museums and heritage.
- Prefer places in the same or neighbouring "area" so the route does not zig-zag across the island.
- The sum of duration_min of your picks must be at most 60% of leftover_min (travel needs the rest).
- If rain_risk is true, only pick places with indoor=true.
- Include at most one food stop per 3 hours.
- "why" is one or two short sentences in second person, concrete and specific to the place (max 140 characters). No emojis.
- "title" is a playful mission title, max 40 characters. Do not reference any video game or franchise.

Reply with JSON only, exactly this shape:
{"schema":"zoot.choice.v1","title":"...","picks":[{"place_id":"...","why":"..."}]}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { key } = groqConfig()
  if (!key) return res.status(503).json({ error: 'GROQ_API_KEY is not set; client should use the deterministic planner.' })
  const body = req.body || {}
  if (tooLarge(body)) return res.status(413).json({ error: 'payload too large' })
  if (!Array.isArray(body.catalog) || !body.catalog.length) return res.status(400).json({ error: 'catalog required' })

  try {
    const { model, data } = await groqJson({
      system: SYSTEM,
      user: {
        traveller: body.input,
        leftover_min: body.leftover_min,
        rain_risk: Boolean(body.rain_risk),
        catalog: body.catalog
      }
    })
    return res.status(200).json({ model, choice: data })
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) })
  }
}
