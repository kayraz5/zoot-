// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  GROQ_URL,
  groqConfig,
  groqJson,
  tooLarge,
} from '../../api/_lib/groq.js'
import { jsonResponse, stubFetch, textResponse, useCleanSlate } from './helpers/index.js'

useCleanSlate()

describe('groqConfig', () => {
  it('returns empty key and the default model when environment values are unset', () => {
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubEnv('GROQ_MODEL', '')

    expect(groqConfig()).toEqual({
      key: '',
      model: 'openai/gpt-oss-120b',
    })
  })

  it('uses configured key and model overrides', () => {
    vi.stubEnv('GROQ_API_KEY', 'configured-key')
    vi.stubEnv('GROQ_MODEL', 'llama-3.3-70b-versatile')

    expect(groqConfig()).toEqual({
      key: 'configured-key',
      model: 'llama-3.3-70b-versatile',
    })
  })
})

describe('tooLarge', () => {
  it('accepts a body whose serialized length is exactly the limit', () => {
    const bodyAtLimit = 'x'.repeat(10 - 2)

    expect(JSON.stringify(bodyAtLimit)).toHaveLength(10)
    expect(tooLarge(bodyAtLimit, 10)).toBe(false)
  })

  it('rejects a body whose serialized length is one over the limit', () => {
    const bodyOverLimit = 'x'.repeat(11 - 2)

    expect(JSON.stringify(bodyOverLimit)).toHaveLength(11)
    expect(tooLarge(bodyOverLimit, 10)).toBe(true)
  })
})

describe('groqJson', () => {
  it('parses a successful JSON response and returns its model', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key')
    vi.stubEnv('GROQ_MODEL', 'test-model')
    let requestBody
    const fetch = stubFetch([[
      GROQ_URL,
      (_url, init) => {
        requestBody = JSON.parse(init.body)
        return jsonResponse({
          model: 'response-model',
          choices: [{ message: { content: '{"answer":"ok"}' } }],
        })
      },
    ]])

    await expect(groqJson({
      system: 'Return JSON.',
      user: { prompt: 'hello' },
    })).resolves.toEqual({
      model: 'response-model',
      data: { answer: 'ok' },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(requestBody.messages[1]).toEqual({
      role: 'user',
      content: JSON.stringify({ prompt: 'hello' }),
    })
  })

  it('throws an error with status 401 when Groq rejects the request', async () => {
    vi.stubEnv('GROQ_API_KEY', 'invalid-key')
    stubFetch([[GROQ_URL, () => textResponse('invalid API key', 401)]])

    const promise = groqJson({ system: 'Return JSON.', user: 'hello' })
    await expect(promise).rejects.toThrow('Groq 401: invalid API key')

    try {
      await promise
    } catch (error) {
      expect(error.status).toBe(401)
    }
  })

  it('throws when the successful response content is not JSON', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-key')
    stubFetch([[
      GROQ_URL,
      () => jsonResponse({ choices: [{ message: { content: 'not JSON' } }] }),
    ]])

    await expect(groqJson({ system: 'Return JSON.', user: 'hello' }))
      .rejects.toBeInstanceOf(SyntaxError)
  })

  it.each([
    ['openai/gpt-oss-120b', true],
    ['openai/gpt-oss-20b', true],
    ['llama-3.3-70b-versatile', false],
  ])('includes reasoning_effort only for %s models', async (model, shouldInclude) => {
    vi.stubEnv('GROQ_API_KEY', 'test-key')
    vi.stubEnv('GROQ_MODEL', model)
    let requestBody
    stubFetch([[
      GROQ_URL,
      (_url, init) => {
        requestBody = JSON.parse(init.body)
        return jsonResponse({ choices: [{ message: { content: '{}' } }] })
      },
    ]])

    await groqJson({ system: 'Return JSON.', user: 'hello' })

    if (shouldInclude) {
      expect(requestBody.reasoning_effort).toBe('low')
    } else {
      expect(requestBody).not.toHaveProperty('reasoning_effort')
    }
  })
})
