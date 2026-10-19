/**
 * Minimal Groq chat client for Vercel functions (Kayra/Hulbert lanes).
 * GROQ_API_KEY stays on the server; the browser only ever calls /api/*.
 */
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export function groqConfig() {
  return {
    key: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
  }
}

export async function groqJson({ system, user, temperature = 0.4, maxTokens = 900 }) {
  const { key, model } = groqConfig()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        // gpt-oss models reason before answering; keep it short so the JSON fits in max_tokens.
        ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) }
        ]
      })
    })
    if (!res.ok) {
      const text = await res.text()
      throw Object.assign(new Error(`Groq ${res.status}: ${text.slice(0, 200)}`), { status: res.status })
    }
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content || '{}'
    return { model: json.model || model, data: JSON.parse(content) }
  } finally {
    clearTimeout(timer)
  }
}

/** Tiny guard so a public URL cannot be used as a free Groq proxy for huge payloads. */
export function tooLarge(body, limit = 24000) {
  return JSON.stringify(body || {}).length > limit
}
