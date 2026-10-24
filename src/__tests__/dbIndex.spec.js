import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

afterEach(() => {
  vi.doUnmock('../model/services/db/remote.js')
  vi.resetModules()
})

async function importFreshIndex({ configured = false } = {}) {
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'https://example.supabase.co' : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'test-anon-key' : '')
  vi.resetModules()
  return import('../model/services/db/index.js')
}

describe('database index service', () => {
  it('uses guest mode when Supabase is not configured', async () => {
    const dbIndex = await importFreshIndex()

    expect(dbIndex.isGuestMode()).toBe(true)
  })

  it('uses guest mode as an override even when Supabase is configured', async () => {
    const dbIndex = await importFreshIndex({ configured: true })

    expect(dbIndex.isGuestMode()).toBe(false)
    localStorage.setItem('zoot.guest', '1')
    expect(dbIndex.isGuestMode()).toBe(true)
  })

  it('sets and clears the guest mode storage override', async () => {
    const dbIndex = await importFreshIndex({ configured: true })

    dbIndex.setGuestMode(true)
    expect(localStorage.getItem('zoot.guest')).toBe('1')

    dbIndex.setGuestMode(false)
    expect(localStorage.getItem('zoot.guest')).toBeNull()
  })

  it('falls back to guest mode and logs when storage reads fail', async () => {
    const dbIndex = await importFreshIndex({ configured: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    expect(dbIndex.isGuestMode()).toBe(true)
    expect(error).toHaveBeenCalledWith(expect.any(Error))
  })

  it('returns the local database by identity in guest mode and preserves a write round trip', async () => {
    const dbIndex = await importFreshIndex()
    const { localDb } = await import('../model/services/db/local.js')
    const db = await dbIndex.getDb()
    const mission = {
      id: 'guest-mission',
      title: 'Guest mission',
      created_at: '2030-01-15T00:00:00.000Z',
    }

    expect(db).toBe(localDb)
    await db.saveMission(mission)

    await expect(localDb.getMission(mission.id)).resolves.toEqual(mission)
  })

  it('creates and reuses the mocked remote database outside guest mode', async () => {
    const remote = { kind: 'mock-remote' }
    const createRemoteDb = vi.fn(() => remote)
    vi.doMock('../model/services/db/remote.js', () => ({ createRemoteDb }))
    const dbIndex = await importFreshIndex({ configured: true })

    expect(dbIndex.isGuestMode()).toBe(false)
    await expect(dbIndex.getDb()).resolves.toBe(remote)
    await expect(dbIndex.getDb()).resolves.toBe(remote)
    expect(createRemoteDb).toHaveBeenCalledTimes(1)
  })
})
