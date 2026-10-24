// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRes, useCleanSlate } from './helpers/index.js'

const groq = vi.hoisted(() => ({
  groqJson: vi.fn(),
}))

vi.mock('../../api/_lib/groq.js', async (importOriginal) => ({
  ...(await importOriginal()),
  groqJson: groq.groqJson,
}))

import handler from '../../api/plan.js'

useCleanSlate()

beforeEach(() => {
  groq.groqJson.mockReset()
  vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
})

const request = (method = 'POST', body = {}) => ({
  method,
  url: '/api/plan',
  body,
})

const validBody = (overrides = {}) => ({
  input: { style: 'budget', interests: ['food'] },
  leftover_min: 180,
  rain_risk: true,
  catalog: [{ id: 'place-1', name: 'Test Place' }],
  ...overrides,
})

describe('/api/plan', () => {
  it.each(['GET', 'PUT', 'DELETE'])('returns 405 for an unsupported %s request', async (method) => {
    const res = mockRes()

    await handler(request(method), res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'POST only' })
    expect(res.statusCode).toBe(405)
  })

  it('returns 503 when GROQ_API_KEY is unset', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const res = mockRes()

    await handler(request('POST', validBody()), res)

    expect(res.statusCode).toBe(503)
    expect(res.body.error).toContain('GROQ_API_KEY is not set')
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it('returns 413 when the request body exceeds the size limit', async () => {
    const res = mockRes()
    const body = validBody({ filler: 'x'.repeat(24000) })

    await handler(request('POST', body), res)

    expect(res.statusCode).toBe(413)
    expect(res.body).toEqual({ error: 'payload too large' })
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it.each([
    ['has no catalog', { catalog: undefined }],
    ['has an empty catalog', { catalog: [] }],
    ['has a non-array catalog', { catalog: { id: 'place-1' } }],
  ])('returns 400 when the request body %s', async (_caseName, body) => {
    const res = mockRes()

    await handler(request('POST', validBody(body)), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'catalog required' })
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it('returns 502 with the Groq error when the mocked Groq call rejects', async () => {
    groq.groqJson.mockRejectedValue(new Error('Groq service unavailable'))
    const res = mockRes()

    await handler(request('POST', validBody()), res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'Groq service unavailable' })
  })

  it('returns the model and choice with a boolean rain risk on success', async () => {
    const choice = {
      schema: 'zoot.choice.v1',
      title: 'Test Quest',
      picks: [{ place_id: 'place-1', why: 'A good stop.' }],
    }
    groq.groqJson.mockResolvedValue({ model: 'test-model', data: choice })
    const res = mockRes()

    await handler(request('POST', validBody({ rain_risk: 'yes' })), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ model: 'test-model', choice })
    expect(groq.groqJson).toHaveBeenCalledTimes(1)
    expect(groq.groqJson.mock.calls[0][0].user.rain_risk).toBe(true)
    expect(typeof groq.groqJson.mock.calls[0][0].user.rain_risk).toBe('boolean')
  })
})
