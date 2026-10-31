import { afterEach, describe, expect, it, vi } from 'vitest'
import { forAll, pick } from '../../../src/__tests__/helpers/gen.js'

// Bug condition probe: non-gated unit tests must not see any
// Supabase, server-secret or test-account variable from .env files or the shell.
// Only booleans are compared, so a failure never shows a value.
// Makes no requests and imports no app module.

const HERMETIC_ENV_NAMES = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_DEV_PANEL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'ORS_API_KEY',
  'E2E_SUPABASE_EMAIL',
  'E2E_SUPABASE_PASSWORD',
  'E2E_SUPABASE_HOST_EMAIL',
  'E2E_SUPABASE_HOST_PASSWORD',
  'E2E_SUPABASE_WRITES',
]

describe('hermetic unit env', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('hides every hermetic variable from import.meta.env and process.env', () => {
    forAll(
      (r) => pick(r, HERMETIC_ENV_NAMES),
      (name) => {
        if (name.startsWith('VITE_')) {
          expect(Boolean(import.meta.env[name]), `${name} is visible to the unit test`).toBe(false)
        }
        expect(Boolean(process.env[name]), `${name} is visible to the unit test`).toBe(false)
      },
      { n: 200, seed: 216 },
    )
  })

  it('shows a vi.stubEnv value and reverts it after vi.unstubAllEnvs()', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'x')
    expect(import.meta.env.VITE_SUPABASE_URL).toBe('x')
    vi.unstubAllEnvs()
    expect(Boolean(import.meta.env.VITE_SUPABASE_URL), 'VITE_SUPABASE_URL is visible to the unit test').toBe(false)
  })
})
