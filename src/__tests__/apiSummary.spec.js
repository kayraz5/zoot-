// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReq, mockRes, useCleanSlate } from './helpers/index.js'

const groq = vi.hoisted(() => ({
  groqJson: vi.fn(),
}))

vi.mock('../../api/_lib/groq.js', async (importOriginal) => ({
  ...(await importOriginal()),
  groqJson: groq.groqJson,
}))

import handler from '../../api/summary.js'

useCleanSlate()

beforeEach(() => {
  groq.groqJson.mockReset()
  vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
})

const request = (method = 'POST', body = {}) => mockReq({
  method,
  url: '/api/summary',
  body,
})

const validBody = (overrides = {}) => ({
  place: {
    name: 'Hawker Centre',
    area: 'Chinatown',
    tags: ['food'],
    blurb: 'A lively local food stop.',
    captions: ['Try the stalls near the entrance.'],
    hours: '10:00-22:00',
    safety_notes: 'Keep your belongings close.',
    ...overrides,
  },
})

describe('/api/summary', () => {
  it.each(['GET', 'PUT', 'DELETE'])('returns 405 for an unsupported %s request', async (method) => {
    const res = mockRes()

    await handler(request(method, validBody()), res)

    expect(res.statusCode).toBe(405)
    expect(res.body).toEqual({ error: 'POST only' })
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it('returns 503 when GROQ_API_KEY is unset', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const res = mockRes()

    await handler(request('POST', validBody()), res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'GROQ_API_KEY is not set' })
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it('returns 413 when the request body exceeds the size limit', async () => {
    const res = mockRes()
    const body = validBody({ blurb: 'x'.repeat(6000) })

    await handler(request('POST', body), res)

    expect(res.statusCode).toBe(413)
    expect(res.body).toEqual({ error: 'payload too large' })
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it('returns 400 when the place name is missing', async () => {
    const res = mockRes()

    await handler(request('POST', validBody({ name: '' })), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'place required' })
    expect(groq.groqJson).not.toHaveBeenCalled()
  })

  it('returns 502 when Groq returns an empty summary', async () => {
    groq.groqJson.mockResolvedValue({ model: 'test-model', data: { summary: '', tips: [] } })
    const res = mockRes()

    await handler(request('POST', validBody()), res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'empty summary' })
  })

  it('returns 502 with the Groq error when the mocked call rejects', async () => {
    groq.groqJson.mockRejectedValue(new Error('Groq service unavailable'))
    const res = mockRes()

    await handler(request('POST', validBody()), res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ error: 'Groq service unavailable' })
  })

  it('returns a summary and at most three string tips on success', async () => {
    groq.groqJson.mockResolvedValue({
      model: 'test-model',
      data: {
        summary: 'A practical stop for your layover.',
        tips: ['Arrive hungry.', 42, 'Bring cash.', 'Keep your receipt.', 'Extra tip.'],
      },
    })
    const res = mockRes()

    await handler(request('POST', validBody()), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      model: 'test-model',
      summary: 'A practical stop for your layover.',
      tips: ['Arrive hungry.', 'Bring cash.', 'Keep your receipt.'],
    })
    expect(res.body.tips).toHaveLength(3)
    expect(res.body.tips.every((tip) => typeof tip === 'string')).toBe(true)
  })
})
