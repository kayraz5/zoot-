import { describe, expect, it } from 'vitest'
import { catalog } from '../model/services/catalog.js'
import { planDeterministic } from '../model/services/planner.js'
import { CHOICE_SCHEMA, validateChoice, validateMission } from '../model/services/itinerarySchema.js'
import { ctx } from './helpers/fixtures.js'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

const allowedIds = new Set(catalog.value.map((place) => place.id))
const catalogIds = [...allowedIds]

const validChoice = (picks = [{ place_id: catalogIds[0], why: 'A useful stop for this layover.' }]) => ({
  schema: CHOICE_SCHEMA,
  title: 'A useful layover quest',
  picks,
})

const clone = (value) => JSON.parse(JSON.stringify(value))

const deterministicMission = () => {
  const result = planDeterministic(ctx())
  expect(result.ok).toBe(true)
  return result.mission
}

describe('validateChoice: validates planner choice responses', () => {
  it('accepts a choice with valid schema, title, catalog picks and reasons', () => {
    expect(validateChoice(validChoice(), allowedIds)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a non-object choice', () => {
    expect(validateChoice(null, allowedIds)).toEqual({ ok: false, errors: ['not an object'] })
  })

  it('rejects a choice with the wrong schema version', () => {
    const choice = validChoice()
    choice.schema = 'zoot.choice.v0'

    const result = validateChoice(choice, allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('schema must be "zoot.choice.v1"')
  })

  it('rejects a choice with no picks', () => {
    const result = validateChoice(validChoice([]), allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('picks must have 1–6 items')
  })

  it('rejects a choice with more than six picks', () => {
    const picks = catalogIds.slice(0, 7).map((place_id) => ({ place_id, why: 'A useful stop.' }))
    const result = validateChoice(validChoice(picks), allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('picks must have 1–6 items')
  })

  it('rejects a pick whose catalog id was not allowed', () => {
    const result = validateChoice(validChoice([{ place_id: 'not-in-the-catalog', why: 'A useful stop.' }]), allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('picks[0].place_id "not-in-the-catalog" is not in the catalog')
  })

  it('rejects duplicate catalog ids in the picks', () => {
    const picks = [
      { place_id: catalogIds[0], why: 'The first stop.' },
      { place_id: catalogIds[0], why: 'The same stop again.' },
    ]
    const result = validateChoice(validChoice(picks), allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain(`picks[1] duplicates ${catalogIds[0]}`)
  })

  it('rejects picks that include app-owned latitude data', () => {
    const result = validateChoice(validChoice([{ place_id: catalogIds[0], why: 'A useful stop.', lat: 1.3 }]), allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('picks[0] must not include lat (the app owns geometry and time)')
  })
})

describe('validateMission: validates deterministic planner missions', () => {
  it('accepts a mission produced from the real planner context and catalog', () => {
    const mission = deterministicMission()

    expect(validateMission(mission, allowedIds)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a mission whose return leg is not last', () => {
    const mission = deterministicMission()
    const returnLeg = mission.legs.at(-1)
    mission.legs = [returnLeg, ...mission.legs.slice(0, -1)]

    const result = validateMission(mission, allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('only the last leg may be (and must be) "return"'))).toBe(true)
  })

  it('rejects a leg that departs before it arrives', () => {
    const mission = deterministicMission()
    const visit = mission.legs.find((leg) => leg.kind === 'visit')
    visit.depart_iso = new Date(Date.parse(visit.arrive_iso) - 60_000).toISOString()

    const result = validateMission(mission, allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('departs before it arrives'))).toBe(true)
  })

  it('rejects a pending leg that overlaps the previous leg', () => {
    const mission = deterministicMission()
    const visits = mission.legs.filter((leg) => leg.kind === 'visit')
    expect(visits.length).toBeGreaterThanOrEqual(2)
    visits[1].arrive_iso = visits[0].arrive_iso

    const result = validateMission(mission, allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('overlaps the previous leg'))).toBe(true)
  })

  it('rejects a return leg that arrives after its arrive-by deadline', () => {
    const mission = deterministicMission()
    const returnLeg = mission.legs.at(-1)
    returnLeg.arrive_by = new Date(Date.parse(returnLeg.arrive_iso) - 60_000).toISOString()

    const result = validateMission(mission, allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('return leg arrives after arrive_by — plan breaks the clock')
  })

  it('rejects a mission with too few legs', () => {
    const mission = deterministicMission()
    mission.legs = [clone(mission.legs.at(-1))]

    const result = validateMission(mission, allowedIds)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('legs must include at least one visit and the return leg')
  })
})
