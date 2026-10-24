// Tiny PostgREST client; the service role key bypasses RLS, so it only ever runs on the server.
// Shared by every /api/* route that needs service-role Supabase access (places sync, route cache, …).

/** Needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY); null if missing. */
export function supabaseFromEnv(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY // new sb_secret_ or legacy service_role
  return url && key ? supabaseRest(url, key) : null
}

export function supabaseRest(url, key) {
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only go in apikey
  const headers = { apikey: key, 'Content-Type': 'application/json' }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  const call = async (path, init) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init?.headers } })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
    return res.status === 204 ? null : res.json().catch(() => null)
  }
  return {
    select: (table, query) => call(`${table}?${query}`),
    upsert: (table, rows, onConflict = 'id') => call(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    })
  }
}
