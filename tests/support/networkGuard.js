import { redact } from './redact.js'

const MARK = Symbol.for('zoot.networkGuard')

const blockedMessage = (method, url) => `Network request blocked in unit test: ${method} ${url}`

function requestParts(input, init) {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request
  const url = String(isRequest ? input.url : (input && typeof input === 'object' && 'href' in input ? input.href : input))
  const method = String(init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase()
  return { url, method }
}

/**
 * Replace `globalThis.fetch` and `globalThis.WebSocket` with guarded versions.
 *
 * The globals are assigned directly (not through `vi.stubGlobal`), so a test's own
 * `vi.stubGlobal('fetch', …)` followed by `vi.unstubAllGlobals()` restores the guard,
 * never the real network.
 *
 * @param {object} [options]
 * @param {(method: string, url: string) => boolean} [options.allow] requests to let through
 * @param {string[]} [options.values] known env values to redact from messages
 * @returns {{ blocked: Array<{method: string, url: string}>, take: () => Array<{method: string, url: string}> }}
 */
export function installNetworkGuard({ allow = () => false, values = [] } = {}) {
  // If a guard is already installed (shared globals), wrap the original, not the guard.
  const realFetch = globalThis.fetch?.[MARK]?.realFetch ?? globalThis.fetch
  const RealWebSocket = globalThis.WebSocket?.[MARK]?.RealWebSocket ?? globalThis.WebSocket
  const blocked = []

  const block = (method, url) => {
    const safeUrl = redact(url, values)
    blocked.push({ method, url: safeUrl })
    return new TypeError(blockedMessage(method, safeUrl))
  }

  async function guardedFetch(input, init) {
    const { url, method } = requestParts(input, init)
    if (allow(method, url)) return realFetch(input, init)
    throw block(method, url)
  }
  guardedFetch[MARK] = { realFetch }

  function GuardedWebSocket(url, protocols) {
    const target = String(url)
    if (RealWebSocket && allow('GET', target)) return new RealWebSocket(url, protocols)
    throw block('GET', target)
  }
  Object.assign(GuardedWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
  if (RealWebSocket?.prototype) GuardedWebSocket.prototype = RealWebSocket.prototype
  GuardedWebSocket[MARK] = { RealWebSocket }

  globalThis.fetch = guardedFetch
  globalThis.WebSocket = GuardedWebSocket

  return {
    blocked,
    /** Return the blocked requests recorded so far and clear the list. */
    take: () => blocked.splice(0, blocked.length),
  }
}

/**
 * Allowlist for the Supabase-gated unit project: only `GET` requests to the same origin as
 * `baseUrl` under `/rest/v1/`. Everything else (writes, auth, realtime, other hosts) is blocked.
 * An empty or invalid `baseUrl` allows nothing.
 *
 * @param {string} baseUrl the configured Supabase project URL
 * @returns {(method: string, url: string) => boolean}
 */
export function readOnlyRestAllow(baseUrl) {
  let origin = null
  try {
    origin = baseUrl ? new URL(baseUrl).origin : null
  } catch {
    origin = null
  }
  return (method, url) => {
    if (!origin || String(method).toUpperCase() !== 'GET') return false
    try {
      const target = new URL(url)
      return target.origin === origin && target.pathname.startsWith('/rest/v1/')
    } catch {
      return false
    }
  }
}
