/**
 * Supabase-gated E2E fixtures for the `supabase` Playwright project (e2e/social/*.supabase.spec.js).
 *
 * Tiers (tests/support/supabaseGate.js):
 *   Tier 0  VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY and a 2xx preflight (global setup)
 *   Tier 1  + E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD                   needs: ['account']
 *   Tier 2  + E2E_SUPABASE_WRITES=1                                         needs: ['writes']
 *           + E2E_SUPABASE_HOST_EMAIL / E2E_SUPABASE_HOST_PASSWORD          needs: ['host']
 *           + the demo seed (demo_users, app_config.dev_social)            needs: ['seed']
 *
 * Usage, at file or `test.describe` scope (before any fixture runs, so a skipped test never signs in):
 *   requireSupabase(test, ['writes', 'host'])
 * and, for dev_simulate scenarios, inside the test once signed in:
 *   await requireSeed(testAccount)
 *
 * Privacy (Requirement 2.19, 3.10):
 *   - Env values come only from Vite's `loadEnv` in memory; nothing here prints them.
 *   - Sign-in happens in Node with in-memory storage, so the password is never typed into the page
 *     and never appears in Playwright steps or reports.
 *   - Every error message passes through `redact()` with the URL, key, emails and passwords.
 *   - Skip reasons are built only from fixed text and variable names.
 */
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { gateFor, loadTestEnv, SEED_MISSING_REASON, VARS } from '../../tests/support/supabaseGate.js'
import { redact } from '../../tests/support/redact.js'
import { installApiStubs, routeExternalHosts } from './harness.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
/** Same mode as e2e/global-setup.js and the web server: dev server locally, preview build on CI. */
const MODE = process.env.CI ? 'production' : 'development'
const STATIC_NEEDS = new Set(['account', 'host', 'writes'])

let envCache = null
/** The test env, loaded once per process in memory by Vite's loadEnv. Never printed. */
function testEnv() {
  envCache ??= loadTestEnv(MODE, ROOT)
  return envCache
}

/** Every secret value an error message might contain, for `redact()`. */
function secretValues(env = testEnv()) {
  return [...VARS.base, ...VARS.account, ...VARS.host].map((name) => env[name])
}

/** Redact env values and secret-shaped strings from text produced by these fixtures. */
export const scrub = (text) => redact(text, secretValues())

/** The Tier 0 decision from global setup (`{ enabled, reason }`), or null when it did not run (`--list`). */
function tier0() {
  const raw = process.env.ZOOT_SUPABASE_GATE
  if (!raw) return null
  try {
    const gate = JSON.parse(raw)
    return { enabled: gate?.enabled === true, reason: typeof gate?.reason === 'string' ? gate.reason : null }
  } catch {
    return null
  }
}

/**
 * The gate for a set of needs, without any request: Tier 0 from global setup, then the account,
 * host and writes variables by presence. `seed` maps to `writes` here; the seed itself can only be
 * checked once signed in (requireSeed).
 * @param {Array<'account' | 'host' | 'writes' | 'seed'>} needs
 * @returns {{ enabled: boolean, reason: string | null }}
 */
export function supabaseGate(needs = []) {
  const env = testEnv()
  const t0 = tier0()
  if (t0 && !t0.enabled) return { enabled: false, reason: t0.reason || 'Supabase-gated: preflight not ok' }
  const wanted = needs.map((need) => (need === 'seed' ? 'writes' : need)).filter((need) => STATIC_NEEDS.has(need))
  // Without global setup (e.g. `playwright test --list`), gateFor reports "preflight not run".
  return gateFor(env, t0 ? { ok: true } : null, wanted)
}

/**
 * Skip every test in the current file / describe (or the current test, when called in a body)
 * unless the gate for `needs` is open. The reason names only variables or the switch.
 */
export function requireSupabase(t, needs = []) {
  const gate = supabaseGate(needs)
  t.skip(!gate.enabled, gate.reason ?? undefined)
  return gate
}

// ── Accounts ─────────────────────────────────────────────────────────────

/** In-memory storage for supabase-js, so sessions never touch disk. */
function memoryStorage(map) {
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
  }
}

/**
 * Sign in one account from Node. Returns `{ client, userId, storageEntry }`, where `storageEntry`
 * is the `[key, value]` pair supabase-js wrote (its own storage key format, not hard-coded here).
 * @param {'account' | 'host'} kind
 */
async function signIn(kind) {
  const env = testEnv()
  const [emailVar, passwordVar] = VARS[kind]
  const missing = [...VARS.base, emailVar, passwordVar].find((name) => !env[name])
  if (missing) throw new Error(`Supabase-gated: ${missing} not set`)

  const store = new Map()
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { storage: memoryStorage(store), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email: env[emailVar], password: env[passwordVar] })
  if (error || !data?.session) {
    throw new Error(scrub(`Test sign-in failed for ${emailVar}: ${error?.message || 'no session returned'}`))
  }
  const storageEntry = [...store.entries()].find(([key]) => key.endsWith('-auth-token'))
  if (!storageEntry) throw new Error(`Test sign-in for ${emailVar} wrote no session to storage`)
  return { client, userId: data.session.user.id, storageEntry }
}

/**
 * Build an account handle. `browserSession()` signs in again for each page, so every page has its
 * own refresh-token family: a page that refreshes its token (for example after the browser clock
 * moved forward) can never invalidate the Node client or another page's session.
 * The handle never signs out (a global sign-out would revoke the page sessions too).
 */
async function accountFor(kind) {
  const first = await signIn(kind)
  return {
    kind,
    client: first.client,
    userId: first.userId,
    storageEntry: first.storageEntry,
    async browserSession() {
      return (await signIn(kind)).storageEntry
    },
  }
}

export const test = base.extend({
  /** Tier 1+: the main test account (E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD), signed in once per worker. */
  testAccount: [async ({}, use) => { await use(await accountFor('account')) }, { scope: 'worker' }],
  /** Two-account scenarios: the host account (E2E_SUPABASE_HOST_EMAIL / E2E_SUPABASE_HOST_PASSWORD). */
  hostAccount: [async ({}, use) => { await use(await accountFor('host')) }, { scope: 'worker' }],
})

export { expect }

// ── Browser harness ──────────────────────────────────────────────────────

/**
 * Signed-in browser environment for the configured project:
 *  - writes a fresh session for `account` into localStorage (only if the page has none yet, so a
 *    token the page refreshed itself is never overwritten) and does NOT set zoot.guest;
 *  - serves the same Open-Meteo / PSI / lightning fixtures and /api/* stubs as the guest harness;
 *  - lets requests to the Supabase origin through and aborts every other external host.
 * Realtime websockets pass through (page.route does not intercept them).
 */
export async function installSupabaseHarness(page, account) {
  const origin = new URL(testEnv().VITE_SUPABASE_URL).origin
  const [key, value] = await account.browserSession()
  await page.addInitScript(([key, value]) => {
    localStorage.removeItem('zoot.guest')
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, [key, value])
  await routeExternalHosts(page, { passThrough: (url) => url.origin === origin })
  await installApiStubs(page)
}

// ── Tier 2 helpers ───────────────────────────────────────────────────────

const must = ({ data, error }, what) => {
  if (error) throw new Error(scrub(`${what}: ${error.message}`))
  return data
}

function requireWrites(what) {
  if (testEnv()[VARS.writes] !== '1') throw new Error(`${what} needs ${VARS.writes}=1`)
}

/**
 * Tier 2 only. Leave every window the account joined (leave_window) and delete its own non-closed
 * quests (delete_quest), so "one quest at a time" never blocks the next run. Run before and after
 * each write scenario.
 */
export async function cleanupSocial(account) {
  requireWrites('cleanupSocial')
  const { client, userId } = account
  const joined = must(await client.from('party_members').select('party_id').eq('user_id', userId).eq('role', 'member'),
    'list joined quests')
  for (const row of joined) must(await client.rpc('leave_window', { p_party: row.party_id }), 'leave_window')
  const hosted = must(await client.from('parties').select('id').eq('host_id', userId).neq('status', 'closed'),
    'list hosted quests')
  for (const row of hosted) must(await client.rpc('delete_quest', { p_party: row.id }), 'delete_quest')
}

/**
 * Skip the current test unless the demo seed is readable signed in (demo_users is non-empty).
 * app_config.dev_social is not readable by clients; `simulate()` skips if the simulator is off.
 */
export async function requireSeed(account) {
  const { data, error } = await account.client.from('demo_users').select('user_id').limit(1)
  const gate = gateFor(testEnv(), { ok: true, seed: !error && Array.isArray(data) && data.length > 0 }, ['seed'])
  base.skip(!gate.enabled, gate.reason ?? undefined)
}

/**
 * Drive the seeded demo travellers (dev_simulate in supabase/social.sql) as the signed-in account.
 * Needs E2E_SUPABASE_WRITES=1; skips the test with the seed reason when the simulator is off.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} partyId
 * @param {'guest_joins' | 'guest_leaves' | 'locate' | 'chat' | 'checkin'} action
 * @returns {Promise<string>} the simulator's message
 */
export async function simulate(client, partyId, action) {
  requireWrites('simulate')
  const { data, error } = await client.rpc('dev_simulate', { p_party: partyId, p_action: action })
  if (error && /simulator is switched off/i.test(error.message)) base.skip(true, SEED_MISSING_REASON)
  if (error) throw new Error(scrub(`dev_simulate ${action}: ${error.message}`))
  return data
}

/**
 * Fill in the profile fields the app needs to plan (travel style) and show a host name, only where
 * they are missing. Tier 2 only: it writes to the account's own profile row.
 */
export async function ensureOnboarded(account, fallbackName) {
  requireWrites('ensureOnboarded')
  const { client, userId } = account
  const profile = must(await client.from('profiles').select('display_name, style').eq('id', userId).maybeSingle(), 'read profile')
  const updates = {}
  if (!profile?.style) updates.style = 'budget'
  if (!profile?.display_name) updates.display_name = fallbackName
  if (Object.keys(updates).length) {
    must(await client.from('profiles').upsert({ id: userId, ...updates }), 'update profile')
  }
  return { displayName: profile?.display_name || fallbackName }
}

/** The account's newest non-closed hosted quest: `{ id, title, starts_at, ends_at }`. */
export async function latestHostedQuest(account) {
  const rows = must(await account.client.from('parties').select('id, title, starts_at, ends_at')
    .eq('host_id', account.userId).neq('status', 'closed').order('created_at', { ascending: false }).limit(1), 'read hosted quest')
  if (!rows.length) throw new Error('The host has no open quest after publishing')
  return rows[0]
}
