import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forAll, int, pick } from '../../../src/__tests__/helpers/gen.js'
import { jsonResponse, stubFetch } from '../../../src/__tests__/helpers/index.js'
import { installNetworkGuard, readOnlyRestAllow } from '../networkGuard.js'
import { redact } from '../redact.js'

// Hermetic: the deny-all guard blocks every fetch and WebSocket with a TypeError
// and a redacted message, and the Supabase allowlist lets through only same-origin GET under
// /rest/v1/. Each test installs its own guard over a fake "real" fetch / WebSocket, so nothing
// can reach the network and the unit setup's guard (restored after each test) records nothing.

const MARK = Symbol.for('zoot.networkGuard')
const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789'
const CUSTOM_BASE = 'https://db.synthetic-project.example.test'

const str = (r, alphabet, lo, hi) => Array.from({ length: int(r, lo, hi) }, () => pick(r, alphabet)).join('')
const genRef = (r) => str(r, LOWER, 8, 20)

const HOSTS = [
  (r) => `https://${genRef(r)}.supabase.co`,
  (r) => `http://${genRef(r)}.supabase.in`,
  () => CUSTOM_BASE,
  () => 'https://api.open-meteo.com',
  () => 'https://router.project-osrm.org',
  () => 'http://localhost:5173',
  (r) => `https://${str(r, LOWER, 3, 10)}.example.test`,
]
const PATHS = ['/', '/rest/v1/missions', '/auth/v1/token?grant_type=password', '/v1/forecast?latitude=1.3',
  '/api/plan', '/route/v1/foot/103.8,1.3;103.9,1.31']
const METHODS = ['GET', 'get', 'POST', 'post', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', undefined]

let setupFetch
let setupWebSocket
let underlyingFetch
let FakeWebSocket

beforeEach(() => {
  setupFetch = globalThis.fetch
  setupWebSocket = globalThis.WebSocket
  // Stand-ins for the real network, wrapped by the guards installed in each test.
  underlyingFetch = vi.fn(async () => jsonResponse({ ok: true }))
  FakeWebSocket = vi.fn(function FakeWebSocket(url) { this.url = String(url) })
  globalThis.fetch = underlyingFetch
  globalThis.WebSocket = FakeWebSocket
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.fetch = setupFetch
  globalThis.WebSocket = setupWebSocket
})

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

describe('network guard (Property 3)', () => {
  it('is installed by the unit setup on fetch and WebSocket', () => {
    expect(setupFetch?.[MARK]).toBeDefined()
    expect(setupWebSocket?.[MARK]).toBeDefined()
  })

  /** **Validates: Requirements 2.13, 2.19, 3.9** */
  it('blocks every fetch with a TypeError and a redacted message', async () => {
    const guard = installNetworkGuard({ values: [CUSTOM_BASE] })
    const inputs = typeof Request === 'undefined' ? ['string', 'url'] : ['string', 'url', 'request']

    await forEachCase((r) => ({
      url: `${pick(r, HOSTS)(r)}${pick(r, PATHS)}`,
      method: pick(r, METHODS),
      input: pick(r, inputs),
    }), async ({ url, method, input }) => {
      const init = method === undefined ? undefined : { method }
      const arg = input === 'string' ? url : input === 'url' ? new URL(url) : new Request(url, init)
      const seen = input === 'string' ? url : new URL(url).href
      const expectedMethod = (method ?? 'GET').toUpperCase()

      const error = await globalThis.fetch(arg, input === 'request' ? undefined : init).catch((e) => e)

      expect(error).toBeInstanceOf(TypeError)
      expect(error.message).toBe(`Network request blocked in unit test: ${expectedMethod} ${redact(seen, [CUSTOM_BASE])}`)
      expect(error.message).not.toMatch(/\.supabase\.(co|in)/)
      expect(error.message.includes(CUSTOM_BASE)).toBe(false)
      expect(guard.take()).toEqual([{ method: expectedMethod, url: redact(seen, [CUSTOM_BASE]) }])
      expect(underlyingFetch).not.toHaveBeenCalled()
    }, { n: 300, seed: 3216 })
  })

  /** **Validates: Requirements 2.13, 2.19** */
  it('blocks every WebSocket with a TypeError and a redacted message', () => {
    const guard = installNetworkGuard()
    forAll((r) => {
      const ref = genRef(r)
      return pick(r, [
        `wss://${ref}.supabase.co/realtime/v1/websocket?vsn=1.0.0`,
        `ws://${ref}.supabase.in/realtime/v1/websocket`,
        `ws://localhost:${int(r, 1024, 65535)}/`,
        `wss://${str(r, LOWER, 3, 10)}.example.test/socket`,
      ])
    }, (url) => {
      let error
      try {
        new globalThis.WebSocket(url)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(TypeError)
      expect(error.message).toBe(`Network request blocked in unit test: GET ${redact(url)}`)
      expect(error.message).not.toMatch(/\.supabase\.(co|in)/)
      expect(guard.take()).toEqual([{ method: 'GET', url: redact(url) }])
      expect(FakeWebSocket).not.toHaveBeenCalled()
    }, { n: 100, seed: 3217 })
  })

  it('keeps stubFetch working and is restored by vi.unstubAllGlobals()', async () => {
    const guard = installNetworkGuard()
    const guardedFetch = globalThis.fetch
    const guardedWebSocket = globalThis.WebSocket

    const stub = stubFetch([['/api/ping', () => jsonResponse({ pong: true })]])
    vi.stubGlobal('WebSocket', vi.fn())
    const res = await globalThis.fetch('https://api.example.test/api/ping')
    expect(await res.json()).toEqual({ pong: true })
    expect(stub).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()

    expect(globalThis.fetch).toBe(guardedFetch)
    expect(globalThis.WebSocket).toBe(guardedWebSocket)
    await expect(globalThis.fetch('https://api.example.test/api/ping')).rejects.toBeInstanceOf(TypeError)
    expect(guard.take()).toHaveLength(1)
    expect(underlyingFetch).not.toHaveBeenCalled()
  })
})

describe('readOnlyRestAllow (Property 3, Supabase project allowlist)', () => {
  const SAME_ORIGINS = [
    (ref) => `https://${ref}.supabase.co`,
    (ref) => `https://${ref}.supabase.co:443`,
    (ref) => `https://${ref.toUpperCase()}.SUPABASE.CO`,
  ]
  const OTHER_ORIGINS = [
    (ref) => `http://${ref}.supabase.co`,
    (ref) => `https://${ref}x.supabase.co`,
    (ref) => `https://${ref}.supabase.co:8443`,
    (ref) => `https://${ref}.supabase.co.evil.test`,
    (ref) => `https://${ref}.supabase.in`,
    (ref) => `wss://${ref}.supabase.co`,
    () => 'https://evil.test',
  ]
  const REST_PATHS = ['/rest/v1/', '/rest/v1/places', '/rest/v1/places?select=id&limit=1', '/rest/v1/missions?id=eq.1']
  const OTHER_PATHS = ['/', '/rest/v1', '/rest/v10/places', '/REST/V1/places', '/auth/v1/token?grant_type=password',
    '/rest/v1/../auth/v1/user', '/rest/v1/%2e%2e/auth/v1/user', '/storage/v1/object/x', '/realtime/v1/websocket',
    '/functions/v1/plan']
  const GETS = ['GET', 'get', 'Get']
  const OTHER_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

  const genRequest = (r) => {
    const ref = genRef(r)
    const sameOrigin = r() < 0.5
    const restPath = r() < 0.5
    const get = r() < 0.6
    return {
      base: pick(r, [`https://${ref}.supabase.co`, `https://${ref}.supabase.co/`, `https://${ref}.supabase.co/rest/v1`]),
      url: `${pick(r, sameOrigin ? SAME_ORIGINS : OTHER_ORIGINS)(ref)}${pick(r, restPath ? REST_PATHS : OTHER_PATHS)}`,
      method: pick(r, get ? GETS : OTHER_METHODS),
      allowed: sameOrigin && restPath && get,
    }
  }

  /** **Validates: Requirements 2.13, 2.18** */
  it('permits only same-origin GET requests under /rest/v1/', () => {
    forAll(genRequest, ({ base, url, method, allowed }) => {
      expect(readOnlyRestAllow(base)(method, url)).toBe(allowed)
    }, { n: 500, seed: 3218 })
  })

  /** **Validates: Requirements 2.13, 2.18** */
  it('lets an installed guard pass through exactly the allowed requests', async () => {
    await forEachCase(genRequest, async ({ base, url, method, allowed }) => {
      const guard = installNetworkGuard({ allow: readOnlyRestAllow(base), values: [base] })
      underlyingFetch.mockClear()

      const outcome = await globalThis.fetch(url, { method }).then(() => 'passed', (e) => e)

      if (allowed) {
        expect(outcome).toBe('passed')
        expect(underlyingFetch).toHaveBeenCalledTimes(1)
        expect(underlyingFetch).toHaveBeenCalledWith(url, { method })
        expect(guard.take()).toEqual([])
      } else {
        expect(outcome).toBeInstanceOf(TypeError)
        expect(underlyingFetch).not.toHaveBeenCalled()
        expect(guard.take()).toHaveLength(1)
      }
    }, { n: 300, seed: 3219 })
  })

  it('allows nothing for an empty or invalid base URL, and never a realtime socket', () => {
    for (const base of ['', undefined, 'not a url']) {
      expect(readOnlyRestAllow(base)('GET', 'https://abcdefgh.supabase.co/rest/v1/places')).toBe(false)
    }
    const allow = readOnlyRestAllow('https://abcdefgh.supabase.co')
    expect(allow('GET', 'wss://abcdefgh.supabase.co/rest/v1/websocket')).toBe(false)
    expect(allow('GET', 'not a url')).toBe(false)
  })
})
