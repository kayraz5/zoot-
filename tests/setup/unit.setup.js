import { afterAll, afterEach } from 'vitest'
import { installNetworkGuard } from '../support/networkGuard.js'

// Unit tests never reach the network. Any real fetch or WebSocket fails the test that
// made it (or, for requests fired outside a test, the file's afterAll). No opt-out:
// a test that needs a response stubs it with stubFetch / vi.stubGlobal.
const guard = installNetworkGuard({ allow: () => false })

function failOnBlocked() {
  const list = guard.take()
  if (list.length === 0) return
  const detail = list.map(({ method, url }) => `${method} ${url}`).join(', ')
  throw new Error(`Blocked ${list.length} network request(s): ${detail}`)
}

afterEach(failOnBlocked)
afterAll(failOnBlocked)
