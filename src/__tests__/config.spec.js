import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

beforeEach(() => {
  vi.resetModules()
})

async function loadConfig({ url = '', anonKey = '', dev = false, devPanel = '' } = {}) {
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', anonKey)
  vi.stubEnv('DEV', dev)
  vi.stubEnv('VITE_DEV_PANEL', devPanel)
  vi.resetModules()
  return import('../model/services/config.js')
}

describe('config: Supabase environment boundary', () => {
  it('uses guest-mode defaults when Supabase variables are empty', async () => {
    const config = await loadConfig()

    expect(config.SUPABASE_URL).toBe('')
    expect(config.SUPABASE_ANON_KEY).toBe('')
    expect(config.HAS_SUPABASE).toBe(false)
  })

  it('enables Supabase only when both variables are present', async () => {
    const configured = await loadConfig({
      url: 'https://example.supabase.co',
      anonKey: 'test-anon-key',
    })

    expect(configured.SUPABASE_URL).toBe('https://example.supabase.co')
    expect(configured.SUPABASE_ANON_KEY).toBe('test-anon-key')
    expect(configured.HAS_SUPABASE).toBe(true)
  })

  it.each([
    ['only the URL', { url: 'https://example.supabase.co' }],
    ['only the anonymous key', { anonKey: 'test-anon-key' }],
  ])('stays in guest mode with %s', async (_description, env) => {
    const config = await loadConfig(env)

    expect(config.HAS_SUPABASE).toBe(false)
  })
})

describe('config: development panel environment boundary', () => {
  it('keeps the development panel off in a production-like environment by default', async () => {
    const config = await loadConfig({ dev: false })

    expect(config.DEV_PANEL).toBe(false)
  })

  it('enables the development panel when VITE_DEV_PANEL is one', async () => {
    const config = await loadConfig({ dev: false, devPanel: '1' })

    expect(config.DEV_PANEL).toBe(true)
  })

  it('keeps the development panel off for another production value', async () => {
    const config = await loadConfig({ dev: false, devPanel: '0' })

    expect(config.DEV_PANEL).toBe(false)
  })
})

describe('config: application constants', () => {
  it('exports the Singapore city and check-in rules', async () => {
    const config = await loadConfig()

    expect(config.CITY).toEqual({
      name: 'Singapore',
      lat: 1.2903,
      lng: 103.8519,
      tz: 'Asia/Singapore',
      utcOffsetMin: 480,
    })
    expect(config.CHECKIN).toEqual({
      radiusM: 80,
      poorAccuracyRadiusM: 120,
      poorAccuracyM: 50,
      rejectAccuracyM: 150,
    })
  })
})
