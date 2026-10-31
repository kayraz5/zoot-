import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.js'

// Server-only secrets read by api/ functions. Unit tests never need real values.
const SERVER_SECRETS = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'ORS_API_KEY',
]

// Variables used only by the Supabase-gated test tiers.
const GATE_ONLY = [
  'E2E_SUPABASE_EMAIL',
  'E2E_SUPABASE_PASSWORD',
  'E2E_SUPABASE_HOST_EMAIL',
  'E2E_SUPABASE_HOST_PASSWORD',
  'E2E_SUPABASE_WRITES',
]

// Project `test.env` is applied last to both import.meta.env and process.env in the
// workers, so a blank here wins over .env, .env.local, .env.test, .env.test.local and
// the shell. Tests that need a configured branch stub it with vi.stubEnv.
const blank = (names) => Object.fromEntries(names.map((name) => [name, '']))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.spec.js', 'tests/**/*.spec.js'],
            exclude: [...configDefaults.exclude, 'e2e/**', '**/*.supabase.spec.js'],
            env: blank([
              'VITE_SUPABASE_URL',
              'VITE_SUPABASE_ANON_KEY',
              'VITE_DEV_PANEL',
              ...SERVER_SECRETS,
              ...GATE_ONLY,
            ]),
            setupFiles: ['./tests/setup/unit.setup.js'],
          },
        },
        {
          // Supabase-gated tests (*.supabase.spec.js). VITE_SUPABASE_* come from Vite's own env
          // loading; server-only secrets stay blank. The global setup runs at most one read-only
          // preflight and provides the gate; the setup file allows only same-origin GET /rest/v1/.
          extends: true,
          test: {
            name: 'supabase',
            include: ['src/**/*.supabase.spec.js'],
            env: blank(SERVER_SECRETS),
            globalSetup: ['./tests/setup/supabase.globalSetup.js'],
            setupFiles: ['./tests/setup/supabase.setup.js'],
          },
        },
      ],
    },
  }),
)
