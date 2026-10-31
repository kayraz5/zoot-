import { afterEach, describe, expect, it, vi } from 'vitest'
import { forAll, int, pick } from '../../../src/__tests__/helpers/gen.js'
import { stubFetch } from '../../../src/__tests__/helpers/index.js'
import { redact } from '../redact.js'
import { ALL_VARS, VARS, gateFor, presence } from '../supabaseGate.js'

// No Leaking Secrets: helper-generated text never contains an env value. Supabase URLs and
// key-shaped strings appear only as <SUPABASE_URL> / <redacted>. Every value here is synthetic.

const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789'
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const DIGITS = '0123456789'
// No characters that occur in the redaction labels or the gate reason templates.
const SYMBOLS = '!#$%&*+?@^~'
const FILLER = ['Error:', 'request', 'failed', 'for', 'GET', 'POST', 'url=', 'key', '{"apikey":"', '"}',
  'Authorization: Bearer', 'at', 'fetch', '->', '(', ')', ',', '\n', '...']
const SEPARATORS = [' ', ' ', '\n', ', ', '"', "'", ' = ', '/']

const str = (r, alphabet, lo, hi) => Array.from({ length: int(r, lo, hi) }, () => pick(r, alphabet)).join('')

const genRef = (r) => `${str(r, LOWER, 4, 10)}${pick(r, ['', '-'])}${str(r, LOWER, 4, 10)}`

function genSupabaseUrl(r, schemes = ['https', 'http', 'wss', 'ws']) {
  const scheme = pick(r, schemes)
  const host = `${genRef(r)}.supabase.${pick(r, ['co', 'in'])}`
  const path = pick(r, ['', '/', '/rest/v1/missions', '/auth/v1/token?grant_type=password', '/realtime/v1/websocket?vsn=1.0.0'])
  return { value: `${scheme}://${host}${path}`, origin: `${scheme}://${host}`, host }
}
const genJwt = (r) => `eyJ${str(r, B64URL, 10, 40)}.${str(r, B64URL, 10, 60)}.${str(r, B64URL, 10, 43)}`
const genSbKey = (r) => `sb_${pick(r, ['publishable', 'secret'])}_${str(r, B64URL, 16, 40)}`
const genPassword = (r) =>
  `${str(r, LOWER + SYMBOLS, 4, 12)}${pick(r, DIGITS)}${pick(r, SYMBOLS)}${str(r, B64URL + SYMBOLS, 4, 12)}`
const genEmail = (r) => `${str(r, LOWER, 3, 12)}@${str(r, LOWER, 3, 10)}.test`
const genCustomUrl = (r) => `https://${str(r, LOWER, 3, 10)}.${str(r, LOWER, 3, 10)}.example.test`

/** Random text with the given secrets embedded (each at least once) between filler words. */
function embed(r, secrets) {
  const parts = []
  const pieces = [...secrets, ...secrets.filter(() => r() < 0.3)]
  for (const secret of pieces) {
    for (let i = int(r, 0, 3); i > 0; i--) parts.push(pick(r, FILLER), pick(r, SEPARATORS))
    parts.push(secret, pick(r, SEPARATORS))
  }
  parts.push(pick(r, FILLER))
  return parts.join('')
}

const expectAbsent = (text, values) => {
  for (const value of values) expect(text.includes(value), 'a generated secret survived').toBe(false)
}

async function forEachCase(gen, fn, { n, seed }) {
  const cases = []
  forAll(gen, (c) => { cases.push(c) }, { n, seed })
  for (const [i, c] of cases.entries()) {
    try {
      await fn(c)
    } catch (e) {
      e.message = `[seed ${seed}, case ${i}] ${JSON.stringify(c)}\n${e.message}`
      throw e
    }
  }
}

describe('redact (Property 5)', () => {
  /** **Validates: Requirements 2.19, 3.10** */
  it('removes Supabase URLs, JWT-shaped strings and sb_ keys by pattern alone', () => {
    forAll((r) => {
      const urls = Array.from({ length: int(r, 0, 2) }, () => genSupabaseUrl(r))
      const keys = Array.from({ length: int(r, 0, 2) }, () => pick(r, [genJwt, genSbKey])(r))
      if (urls.length + keys.length === 0) keys.push(genJwt(r))
      return { urls, keys, text: embed(r, [...urls.map((u) => u.value), ...keys]) }
    }, ({ urls, keys, text }) => {
      const out = redact(text)
      expectAbsent(out, [...keys, ...urls.flatMap((u) => [u.value, u.origin, u.host])])
      if (urls.length) expect(out).toContain('<SUPABASE_URL>')
      if (keys.length) expect(out).toContain('<redacted>')
    }, { n: 400, seed: 5216 })
  })

  /** **Validates: Requirements 2.19, 3.10** */
  it('removes every known value passed in, whatever its shape', () => {
    forAll((r) => {
      const values = {
        url: genCustomUrl(r),
        anonKey: str(r, B64URL, 20, 40),
        email: genEmail(r),
        password: genPassword(r),
      }
      const embedded = Object.values(values).filter(() => r() < 0.8)
      return { values, embedded, text: embed(r, embedded.length ? embedded : [values.password]) }
    }, ({ values, embedded, text }) => {
      const out = redact(text, [...Object.values(values), '', undefined, null])
      expectAbsent(out, Object.values(values))
      if (embedded.includes(values.url)) expect(out).toContain('<SUPABASE_URL>')
    }, { n: 400, seed: 5217 })
  })

  /** **Validates: Requirements 2.19, 3.10** */
  it('never puts a generated value into gate reasons or the presence report', () => {
    forAll((r) => {
      const env = {
        VITE_SUPABASE_URL: genSupabaseUrl(r, ['https']).origin,
        VITE_SUPABASE_ANON_KEY: pick(r, [genJwt, genSbKey])(r),
        E2E_SUPABASE_EMAIL: genEmail(r),
        E2E_SUPABASE_PASSWORD: genPassword(r),
        E2E_SUPABASE_HOST_EMAIL: genEmail(r),
        E2E_SUPABASE_HOST_PASSWORD: genPassword(r),
      }
      for (const name of [...VARS.base, ...VARS.account, ...VARS.host]) if (r() < 0.2) delete env[name]
      env[VARS.writes] = pick(r, ['1', '0', ''])
      env[VARS.skip] = pick(r, ['', '', '', '1'])
      const kind = pick(r, ['ok', 'http', 'error', 'odd-error'])
      const preflightResult =
        kind === 'ok' ? { ok: true, status: int(r, 200, 299), seed: r() < 0.5 }
          : kind === 'http' ? { ok: false, status: int(r, 300, 599) }
            : kind === 'error' ? { ok: false, errorName: pick(r, ['TypeError', 'AbortError']) }
              // A hostile error name (for example a message echoing a secret) must not pass through.
              : { ok: false, errorName: pick(r, [env.E2E_SUPABASE_PASSWORD, env.VITE_SUPABASE_ANON_KEY]) || 'x1' }
      const needs = ['account', 'host', 'writes', 'seed'].filter(() => r() < 0.4)
      return { env, preflightResult, needs }
    }, ({ env, preflightResult, needs }) => {
      const secrets = Object.entries(env)
        .filter(([name, value]) => value && name !== VARS.writes && name !== VARS.skip)
        .map(([, value]) => value)
      const { reason } = gateFor(env, preflightResult, needs)
      expectAbsent(String(reason), secrets)
      expectAbsent(JSON.stringify(presence(env)), secrets)
      expectAbsent(JSON.stringify(presence(env, [...ALL_VARS, 'SUPABASE_SECRET_KEY'])), secrets)
    }, { n: 400, seed: 5218 })
  })

  describe('stubFetch', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    /** **Validates: Requirements 2.19** */
    it('redacts a *.supabase.co URL in the unexpected-fetch error', async () => {
      await forEachCase((r) => genSupabaseUrl(r, ['https']), async ({ value, host }) => {
        stubFetch([['/never-matches', () => null]])
        const error = await globalThis.fetch(value).catch((e) => e)
        vi.unstubAllGlobals()

        expect(error).toBeInstanceOf(Error)
        expect(error.message.startsWith('Unexpected fetch in test: <SUPABASE_URL>')).toBe(true)
        expect(error.message.includes(host)).toBe(false)
      }, { n: 50, seed: 5219 })
    })
  })
})
