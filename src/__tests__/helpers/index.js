import { afterEach, beforeEach, vi } from 'vitest'

/** Fixed future day in Singapore time for deterministic date-based tests. */
export const DAY = '2030-01-15'

export const at = (hhmm, day = DAY) => `${day}T${hhmm}:00+08:00`

export const T = (hhmm, day) => Date.parse(at(hhmm, day))

/** Freeze Date only; promise and fetch timing remain real. */
export function setNow(ms) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(ms)
}

/** Create a fetch-compatible JSON response double. */
export const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

/** Create a fetch-compatible text response double. */
export const textResponse = (text, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text,
  json: async () => JSON.parse(text),
})

/** Stub global fetch with substring or RegExp route matching. */
export function stubFetch(routes = []) {
  const fn = vi.fn(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const hit = routes.find(([matcher]) => (
      matcher instanceof RegExp ? matcher.test(url) : url.includes(matcher)
    ))
    if (!hit) throw new Error(`Unexpected fetch in test: ${url}`)
    return hit[1](url, init)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Build a plain Vercel-style request double. */
export const mockReq = ({ method = 'GET', url = '/', body, headers = {} } = {}) => ({
  method,
  url,
  body,
  headers,
})

/** Build a chained Vercel-style response double with recorded output. */
export function mockRes() {
  const res = { statusCode: null, body: undefined, headers: {} }
  res.status = vi.fn((code) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body) => {
    res.body = body
    return res
  })
  res.setHeader = vi.fn((key, value) => {
    res.headers[key.toLowerCase()] = value
    return res
  })
  return res
}

/** Keep tests isolated by clearing storage and restoring Vitest state. */
export function useCleanSlate() {
  const clearStorage = () => {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  }

  beforeEach(clearStorage)
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    clearStorage()
  })
}
