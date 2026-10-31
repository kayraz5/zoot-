import { describe, expect, it, vi } from 'vitest'
import { buildMission, summarizePlace } from '../model/services/groq.js'
import { groqCatalogSlice } from '../model/services/planner.js'
import { CHOICE_SCHEMA } from '../model/services/itinerarySchema.js'
import { ctx } from './helpers/fixtures.js'
import { jsonResponse, stubFetch, useCleanSlate } from './helpers/index.js'

useCleanSlate()

const planningContext = (overrides = {}) => ctx({
  cityRisk: { severity: 0 },
  ...overrides,
})

const fallbackPlace = {
  id: 'stored-place',
  name: 'Stored Place',
  blurb: 'A calm place to pause between flights.',
  captions: ['Look up at the roofline.', 'Keep a little water with you.'],
  safety_notes: 'Stay aware of your belongings.',
}

const validGroqResponse = (context) => {
  const slice = groqCatalogSlice(context)
  expect(slice.length).toBeGreaterThan(0)

  return {
    model: 'test-groq-model',
    choice: {
      schema: CHOICE_SCHEMA,
      title: 'A useful layover quest',
      picks: [{
        place_id: slice[0].id,
        why: 'This stop fits the layover and your interests.',
      }],
    },
  }
}

describe('buildMission', () => {
  it('refuses a severity-four city alert without making a network request', async () => {
    const fetchMock = stubFetch()
    const result = await buildMission(planningContext({
      cityRisk: { severity: 4, headline: 'Severe weather' },
    }))

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      source: 'fallback',
    }))
    expect(result.reason).toContain('Danger alert: Severe weather')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the offline planner without making a network request when offlineOnly is set', async () => {
    const fetchMock = stubFetch()
    const statuses = []
    const result = await buildMission(planningContext({ offlineOnly: true }), {
      onStatus: (message) => statuses.push(message),
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      source: 'fallback',
      fallbackReason: null,
    }))
    expect(statuses).toEqual(['Planning offline with the route engine…'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back after one attempt when the planning endpoint returns 503', async () => {
    const fetchMock = stubFetch([
      ['/api/plan', () => jsonResponse({ error: 'Groq is not configured' }, 503)],
    ])
    const statuses = []
    const result = await buildMission(planningContext(), {
      onStatus: (message) => statuses.push(message),
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      source: 'fallback',
      fallbackReason: 'Groq is not configured',
    }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual([
      'Groq is choosing your stops…',
      'Planning offline with the route engine…',
    ])
  })

  it('retries an invalid choice once and then uses the fallback planner', async () => {
    const fetchMock = stubFetch([
      ['/api/plan', () => jsonResponse({
        model: 'test-groq-model',
        choice: { schema: CHOICE_SCHEMA, title: 'Invalid choice', picks: [] },
      })],
    ])
    const statuses = []
    const result = await buildMission(planningContext(), {
      onStatus: (message) => statuses.push(message),
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      source: 'fallback',
    }))
    expect(result.fallbackReason).toContain('picks must have 1–6 items')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(statuses).toEqual([
      'Groq is choosing your stops…',
      'Groq went off-script — retrying once…',
      'Planning offline with the route engine…',
    ])
  })

  it('returns a Groq-sourced mission for a valid choice from the catalog slice', async () => {
    const context = planningContext()
    const response = validGroqResponse(context)
    const fetchMock = stubFetch([
      ['/api/plan', () => jsonResponse(response)],
    ])

    const result = await buildMission(context)

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      source: 'groq',
    }))
    expect(result.mission).toEqual(expect.objectContaining({
      source: 'groq',
      groq_model: 'test-groq-model',
      fallback_used: false,
    }))
    expect(result.mission.legs.at(-1).kind).toBe('return')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the timeout reason when the planning request aborts', async () => {
    const timeout = Object.assign(new Error('request aborted'), { name: 'AbortError' })
    const fetchMock = stubFetch([
      ['/api/plan', () => Promise.reject(timeout)],
    ])

    const result = await buildMission(planningContext())

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      source: 'fallback',
      fallbackReason: 'Groq timed out',
    }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('summarizePlace', () => {
  it('returns a cached summary without making a network request', async () => {
    const cached = {
      summary: 'Already saved.',
      tips: ['Use the covered entrance.'],
      source: 'groq',
      model: 'cached-model',
    }
    localStorage.setItem('zoot.summary.cached-place', JSON.stringify(cached))
    const fetchMock = stubFetch()

    const result = await summarizePlace({ id: 'cached-place', name: 'Cached Place' })

    expect(result).toEqual(cached)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('persists a successful summary response in localStorage', async () => {
    const fetchMock = stubFetch([
      ['/api/summary', () => jsonResponse({
        model: 'summary-model',
        summary: 'A concise AI summary.',
        tips: ['Go early', 'Bring water'],
      })],
    ])

    const result = await summarizePlace({ id: 'fresh-place', name: 'Fresh Place' })

    expect(result).toEqual({
      summary: 'A concise AI summary.',
      tips: ['Go early', 'Bring water'],
      source: 'groq',
      model: 'summary-model',
    })
    expect(JSON.parse(localStorage.getItem('zoot.summary.fresh-place'))).toEqual(result)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to stored blurb, captions and safety notes after a summary failure', async () => {
    const fetchMock = stubFetch([
      ['/api/summary', () => Promise.reject(new Error('summary unavailable'))],
    ])

    const result = await summarizePlace(fallbackPlace)

    expect(result).toEqual({
      summary: 'A calm place to pause between flights. Look up at the roofline.',
      tips: ['Keep a little water with you.', 'Stay aware of your belongings.'],
      source: 'stored',
    })
    expect(localStorage.getItem('zoot.summary.stored-place')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
