/**
 * Remove env values and secret-shaped strings from text produced by test helpers.
 *
 * - Each non-empty string in `values` is replaced: URL values with `<SUPABASE_URL>`,
 *   everything else (keys, emails, passwords) with `<redacted>`.
 * - Any `*.supabase.co` / `*.supabase.in` origin (http, https, ws, wss) becomes `<SUPABASE_URL>`.
 * - JWT-shaped strings and `sb_publishable_` / `sb_secret_` keys become `<redacted>`.
 *
 * The pattern rules apply even when no values are passed, so the unit project (which
 * never sees real values) still redacts anything that looks like a project URL or key.
 */
export function redact(text, values = []) {
  let out = String(text ?? '')

  const known = [...new Set((values || []).filter((v) => typeof v === 'string' && v.length > 0))]
    // Longest first, so a URL is replaced before any shorter value it contains.
    .sort((a, b) => b.length - a.length)
  for (const value of known) {
    const label = /^(?:https?|wss?):\/\//i.test(value) ? '<SUPABASE_URL>' : '<redacted>'
    out = out.split(value).join(label)
  }

  return out
    // http(s) per the design, plus ws(s) so realtime WebSocket URLs are covered too.
    .replace(/(?:https?|wss?):\/\/[a-z0-9-]+\.supabase\.(co|in)/gi, '<SUPABASE_URL>')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<redacted>')
    .replace(/sb_(publishable|secret)_[\w-]+/g, '<redacted>')
}
