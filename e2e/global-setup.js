import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadTestEnv, resolveGate, VARS } from '../tests/support/supabaseGate.js'
import { redact } from '../tests/support/redact.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Compute the Tier 0 Supabase gate once per run and hand it to the workers through
 * `ZOOT_SUPABASE_GATE` (Playwright passes env changes made here on to workers).
 *
 * - No request when SKIP_SUPABASE=1 or a base variable is missing; otherwise exactly one
 *   read-only preflight GET (see tests/support/supabaseGate.js).
 * - The env is loaded in memory by Vite's `loadEnv` and never printed. The stored JSON holds
 *   only `{ enabled, reason }`, and the reason is name-only (redacted again as a safeguard).
 * - Mode matches the web server: the dev server locally, the preview of a production build on CI.
 * - `playwright test --list` does not run global setup, so listing sends no request.
 */
export default async function globalSetup() {
  const mode = process.env.CI ? 'production' : 'development'
  const env = loadTestEnv(mode, ROOT)
  const { enabled, reason } = await resolveGate(env)
  const known = [...VARS.base, ...VARS.account, ...VARS.host].map((name) => env[name])
  process.env.ZOOT_SUPABASE_GATE = JSON.stringify({
    enabled,
    reason: reason === null ? null : redact(reason, known),
  })
}
