import { redact } from '../support/redact.js'
import { loadTestEnv, resolveGate } from '../support/supabaseGate.js'

/**
 * Global setup for the Vitest `supabase` project. Runs once, only when that project has tests.
 *
 * Computes the Tier 0 (anon read) gate: no request when SKIP_SUPABASE=1 or a base variable is
 * missing, otherwise exactly one read-only preflight GET. Gated tests read the result with
 * `inject('supabaseGate')`. The provided object holds `enabled` and a name-only `reason`.
 *
 * @param {import('vitest/node').TestProject} project
 */
export default async function setup(project) {
  const root = project?.config?.root ?? process.cwd()
  const env = loadTestEnv('test', root)
  const gate = await resolveGate(env)
  const values = [env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY]
  project.provide('supabaseGate', {
    enabled: gate.enabled,
    reason: gate.reason === null ? null : redact(gate.reason, values),
  })
}
