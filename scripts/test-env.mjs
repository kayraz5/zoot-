#!/usr/bin/env node
/**
 * Presence report for the Supabase-gated test tiers: `pnpm run test:env [-- --preflight]`.
 *
 * For each mode (`test` for Vitest, `development` for the local Playwright dev server) it prints
 * one line per gate variable, `set` or `not set`. With `--preflight` it also sends the gate's
 * single read-only GET (public places table, `select=id&limit=1`) and prints only the HTTP
 * status, the error name, or why the request was skipped.
 *
 * Privacy: env files are read only through Vite's `loadEnv` (in memory). The script never prints
 * a value, a file's contents, a URL or a response body.
 */
import { fileURLToPath } from 'node:url'
import { ALL_VARS, gateFor, loadTestEnv, presence, preflight } from '../tests/support/supabaseGate.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MODES = ['test', 'development']
const PREFIX = 'Supabase-gated: '
const wantPreflight = process.argv.slice(2).includes('--preflight')

/** Preflight line for one env: `HTTP <status>`, `failed (<ErrorName>)` or `skipped (<reason>)`. */
async function preflightLine(env, cache) {
  // gateFor with a passing preflight and no tier needs reports only the request-free checks
  // (SKIP_SUPABASE=1, missing base variable), whose reasons name variables only.
  const early = gateFor(env, { ok: true }).reason
  if (early) return `skipped (${early.replace(PREFIX, '')})`

  // Reuse the result when another mode resolved to the same project, so at most one GET per
  // distinct project is sent. The cache key stays in memory and is never printed.
  const key = `${env.VITE_SUPABASE_URL}\n${env.VITE_SUPABASE_ANON_KEY}`
  if (!cache.has(key)) cache.set(key, preflight(env))
  const result = await cache.get(key)
  if (result.errorName) return `failed (${result.errorName})`
  return `HTTP ${result.status}`
}

async function main() {
  const cache = new Map()
  const width = Math.max(...ALL_VARS.map((name) => name.length))
  const lines = []
  for (const mode of MODES) {
    const env = loadTestEnv(mode, ROOT)
    lines.push(`mode: ${mode}`)
    for (const { name, set } of presence(env, ALL_VARS)) {
      lines.push(`  ${name.padEnd(width)}  ${set ? 'set' : 'not set'}`)
    }
    if (wantPreflight) lines.push(`  preflight: ${await preflightLine(env, cache)}`)
  }
  console.log(lines.join('\n'))
}

main().catch((err) => {
  // Error name only: messages from env loading could quote file contents.
  const name = typeof err?.name === 'string' && /^[A-Za-z]{1,40}$/.test(err.name) ? err.name : 'Error'
  console.error(`test:env failed (${name})`)
  process.exitCode = 1
})
