// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import snapshot from '../model/data/sgEntrySnapshot.js'
import { mockReq, mockRes, useCleanSlate } from './helpers/index.js'

const immigration = vi.hoisted(() => ({
  fetchIcaSlugs: vi.fn(),
  fetchIndexRules: vi.fn(),
}))

vi.mock('../../api/_lib/immigration.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchIcaSlugs: immigration.fetchIcaSlugs,
  fetchIndexRules: immigration.fetchIndexRules,
}))

useCleanSlate()

let handler

beforeEach(async () => {
  // entry-rule.js caches live sources at module scope; import a fresh handler for every test.
  vi.resetModules()
  immigration.fetchIcaSlugs.mockReset()
  immigration.fetchIndexRules.mockReset()
  immigration.fetchIcaSlugs.mockResolvedValue([...snapshot.ica.slugs])
  immigration.fetchIndexRules.mockResolvedValue({ ...snapshot.index.rules })
  handler = (await import('../../api/entry-rule.js')).default
})

const request = (passport) => mockReq({
  url: passport === undefined
    ? '/api/entry-rule'
    : `/api/entry-rule?passport=${passport}`,
})

describe('/api/entry-rule', () => {
  it.each([
    ['missing', undefined],
    ['one-character', 'I'],
    ['three-character', 'IND'],
  ])('returns 400 when the passport code is %s', async (_caseName, passport) => {
    const res = mockRes()

    await handler(request(passport), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'passport must be a 2-letter country code' })
    expect(immigration.fetchIcaSlugs).not.toHaveBeenCalled()
    expect(immigration.fetchIndexRules).not.toHaveBeenCalled()
  })

  it('normalizes a lowercase passport and returns the live immigration result with cache control', async () => {
    const res = mockRes()

    await handler(request('in'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      passport: 'IN',
      status: 'vftf-visa',
      live: true,
    })
    expect(res.headers['cache-control']).toBe('s-maxage=86400, stale-while-revalidate=604800')
    expect(immigration.fetchIcaSlugs).toHaveBeenCalledTimes(1)
    expect(immigration.fetchIndexRules).toHaveBeenCalledTimes(1)
  })

  it('returns home for a Singapore passport', async () => {
    const res = mockRes()

    await handler(request('sg'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ passport: 'SG', status: 'home', live: true })
  })

  it('returns 404 when live rules have no entry for the passport', async () => {
    const rules = { ...snapshot.index.rules }
    delete rules.US
    immigration.fetchIndexRules.mockResolvedValue(rules)
    const res = mockRes()

    await handler(request('us'), res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: 'no entry rules for US' })
  })

  it('falls back to the snapshot when live helpers reject', async () => {
    immigration.fetchIcaSlugs.mockRejectedValue(new Error('ICA unavailable'))
    immigration.fetchIndexRules.mockRejectedValue(new Error('Passport Index unavailable'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = mockRes()

    await handler(request('in'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      passport: 'IN',
      status: 'vftf-visa',
      checkedOn: snapshot.ica.checkedOn,
      live: false,
    })
    expect(warning).toHaveBeenCalledWith(
      '[entry-rule] using the saved snapshot:',
      'ICA unavailable; Passport Index unavailable',
    )
  })
})
