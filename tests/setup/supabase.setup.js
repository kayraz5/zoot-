import { afterAll, afterEach } from 'vitest'
import { installNetworkGuard, readOnlyRestAllow } from '../support/networkGuard.js'
import { redact } from '../support/redact.js'

// Supabase-gated unit tests are read-only by construction: only same-origin GET requests under
// /rest/v1/ reach the configured project. Writes, auth calls, realtime sockets and other hosts are
// blocked and fail the test. Messages never contain the project URL or key.
const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const values = [url, key]

const guard = installNetworkGuard({ allow: readOnlyRestAllow(url), values })

function failOnBlocked() {
  const list = guard.take()
  if (list.length === 0) return
  const detail = list.map(({ method, url: blockedUrl }) => `${method} ${blockedUrl}`).join(', ')
  throw new Error(redact(`Blocked ${list.length} network request(s): ${detail}`, values))
}

afterEach(failOnBlocked)
afterAll(failOnBlocked)
