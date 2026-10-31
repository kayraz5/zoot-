/**
 * Supabase gate for the optional, Supabase-backed test tiers (unit `supabase` project and the
 * Playwright `supabase` project). Plain ESM with no Vitest import, so Vitest, Playwright and
 * Node scripts can all use it.
 *
 * Tiers (design.md, Glossary):
 *   - Tier 0, anon read:          VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *   - Tier 1, signed-in read:     Tier 0 + E2E_SUPABASE_EMAIL + E2E_SUPABASE_PASSWORD   (needs.account)
 *   - Tier 2, writes as accounts: Tier 1 + E2E_SUPABASE_WRITES=1                         (needs.writes)
 *     two-account scenarios also need E2E_SUPABASE_HOST_EMAIL + E2E_SUPABASE_HOST_PASSWORD (needs.host)
 *     dev_simulate scenarios also need the demo seed                                    (needs.seed)
 *
 * Privacy: nothing here returns, logs or embeds an env value. `presence()` returns names and
 * booleans, gate reasons are built from fixed text, variable names, an HTTP status or an error
 * name, and the preflight discards the response body.
 */
import { loadEnv } from 'vite'

export const VARS = Object.freeze({
  base: Object.freeze(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']),
  account: Object.freeze(['E2E_SUPABASE_EMAIL', 'E2E_SUPABASE_PASSWORD']),
  host: Object.freeze(['E2E_SUPABASE_HOST_EMAIL', 'E2E_SUPABASE_HOST_PASSWORD']),
  writes: 'E2E_SUPABASE_WRITES',
  skip: 'SKIP_SUPABASE',
})

/** Every variable name the gate looks at, in report order. */
export const ALL_VARS = Object.freeze([
  ...VARS.base,
  ...VARS.account,
  ...VARS.host,
  VARS.writes,
  VARS.skip,
])

export const PREFLIGHT_PATH = '/rest/v1/places?select=id&limit=1'
export const DEFAULT_TIMEOUT_MS = 5000
export const SEED_MISSING_REASON = 'Supabase-gated: demo seed missing (demo_users / app_config.dev_social)'

const PREFIX = 'Supabase-gated: '

/**
 * Load the env for a mode with Vite's own `loadEnv` (all prefixes). The result stays in memory;
 * shell variables override file values, so `SKIP_SUPABASE=1` in the shell always wins.
 * @param {string} mode   'test' for Vitest, 'development' / 'production' for Playwright
 * @param {string} root   directory holding the env files
 */
export function loadTestEnv(mode, root = process.cwd()) {
  return loadEnv(mode, root, '')
}

/**
 * Presence report: `[{ name, set }]`. Never returns values.
 * @param {Record<string, string | undefined>} env
 * @param {readonly string[]} [names]
 */
export function presence(env, names = ALL_VARS) {
  return names.map((name) => ({ name, set: Boolean(env?.[name]) }))
}

/** Normalize `needs` from an array (`['account', 'writes']`) or an object (`{ account: true }`). */
function normalizeNeeds(needs) {
  const list = Array.isArray(needs)
    ? needs
    : Object.entries(needs || {}).filter(([, on]) => on).map(([name]) => name)
  const set = new Set(list)
  // Higher tiers imply the lower ones: writes and host scenarios run as a signed-in account.
  if (set.has('writes') || set.has('host') || set.has('seed')) set.add('account')
  if (set.has('seed')) set.add('writes')
  return set
}

const firstMissing = (env, names) => names.find((name) => !env?.[name])

/** Reason for the checks that need no request (switch, base variables), or null. */
function beforeRequestReason(env) {
  if (env?.[VARS.skip] === '1') return `${PREFIX}${VARS.skip}=1`
  const missing = firstMissing(env, VARS.base)
  if (missing) return `${PREFIX}${missing} not set`
  return null
}

const safeStatus = (status) =>
  Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : 'unknown'
const safeErrorName = (name) => (typeof name === 'string' && /^[A-Za-z]{1,40}$/.test(name) ? name : 'Error')

function preflightReason(result) {
  if (!result) return `${PREFIX}preflight not run`
  if (result.ok) return null
  if (result.timedOut) {
    const ms = Number.isInteger(result.timeoutMs) && result.timeoutMs > 0 ? result.timeoutMs : DEFAULT_TIMEOUT_MS
    return `${PREFIX}preflight timed out after ${ms} ms`
  }
  if (result.errorName) return `${PREFIX}preflight failed (${safeErrorName(result.errorName)})`
  return `${PREFIX}preflight HTTP ${safeStatus(result.status)}`
}

/**
 * Decide whether a gated tier runs. Checks in this order and reports the first failure:
 *   SKIP_SUPABASE=1 → missing base variable → preflight not ok → missing account / host
 *   variable → E2E_SUPABASE_WRITES not 1 → demo seed missing.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ ok: boolean, status?: number, errorName?: string, timedOut?: boolean,
 *           timeoutMs?: number, seed?: boolean } | null | undefined} preflightResult
 *        result of `preflight()`; `seed: true` once a caller has confirmed the demo seed
 * @param {string[] | Record<string, boolean>} [needs] subset of account, host, writes, seed
 * @returns {{ enabled: boolean, reason: string | null }}
 */
export function gateFor(env, preflightResult, needs = []) {
  const want = normalizeNeeds(needs)
  const reason =
    beforeRequestReason(env)
    ?? preflightReason(preflightResult)
    ?? (want.has('account') ? missingReason(env, VARS.account) : null)
    ?? (want.has('host') ? missingReason(env, VARS.host) : null)
    ?? (want.has('writes') && env?.[VARS.writes] !== '1' ? `${PREFIX}${VARS.writes} is not 1` : null)
    ?? (want.has('seed') && preflightResult?.seed !== true ? SEED_MISSING_REASON : null)
  return { enabled: reason === null, reason }
}

function missingReason(env, names) {
  const missing = firstMissing(env, names)
  return missing ? `${PREFIX}${missing} not set` : null
}

/**
 * Read-only preflight: exactly one GET `<url>/rest/v1/places?select=id&limit=1` with the anon key
 * in the `apikey` header. Sends no writes, sign-ups or auth calls, discards the body and prints
 * nothing. Never throws.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status?: number, errorName?: string, timedOut?: boolean, timeoutMs?: number }>}
 */
export async function preflight(env, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = String(env?.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = String(env?.VITE_SUPABASE_ANON_KEY || '')
  try {
    const res = await fetchImpl(`${base}${PREFLIGHT_PATH}`, {
      method: 'GET',
      headers: { apikey: key },
      signal: AbortSignal.timeout(timeoutMs),
    })
    try {
      await res.body?.cancel?.()
    } catch {
      // Body already consumed or not cancellable: nothing to discard.
    }
    return { ok: Boolean(res.ok), status: res.status }
  } catch (err) {
    const errorName = safeErrorName(err?.name)
    return errorName === 'TimeoutError'
      ? { ok: false, errorName, timedOut: true, timeoutMs }
      : { ok: false, errorName }
  }
}

/**
 * Convenience: apply the request-free checks first, run the preflight only when they pass,
 * then apply the rest. `SKIP_SUPABASE=1` or a missing base variable sends no request.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ needs?: string[] | Record<string, boolean>, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function resolveGate(env, { needs = [], fetchImpl, timeoutMs } = {}) {
  const early = beforeRequestReason(env)
  if (early) return { enabled: false, reason: early }
  const result = await preflight(env, { fetchImpl, timeoutMs })
  return gateFor(env, result, needs)
}
