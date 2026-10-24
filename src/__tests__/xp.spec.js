import { describe, it, expect } from 'vitest'
import { levelFor, TITLES, titleFor } from '../model/services/xp.js'
import { useCleanSlate } from './helpers/index.js'
import { forAll, int } from './helpers/gen.js'

useCleanSlate()

describe('levelFor: calculates levels and progress from XP', () => {
  it('returns level one with no progress at zero XP', () => {
    expect(levelFor(0)).toEqual({ level: 1, floor: 0, next: 100, progress: 0 })
  })

  it('starts level two at one hundred XP', () => {
    expect(levelFor(100)).toEqual({ level: 2, floor: 100, next: 400, progress: 0 })
  })

  it('keeps three hundred ninety-nine XP just below the level three boundary', () => {
    expect(levelFor(399)).toEqual({ level: 2, floor: 100, next: 400, progress: 0.9966666666666667 })
  })

  it('starts level three at four hundred XP', () => {
    expect(levelFor(400)).toEqual({ level: 3, floor: 400, next: 900, progress: 0 })
  })

  it('defaults to zero XP when no input is provided', () => {
    expect(levelFor()).toEqual(levelFor(0))
  })

  // Feature: test-coverage-expansion, Property 2: Level bounds and monotonicity
  it('keeps generated XP within level bounds and orders levels monotonically', () => {
    forAll((r) => {
      const first = int(r, 0, 10 ** 7)
      const second = int(r, first, 10 ** 7)
      return { first, second }
    }, ({ first, second }) => {
      const result = levelFor(first)
      const later = levelFor(second)

      expect(result.level).toBeGreaterThanOrEqual(1)
      expect(result.floor).toBeLessThanOrEqual(first)
      expect(first).toBeLessThan(result.next)
      expect(result.progress).toBeGreaterThanOrEqual(0)
      expect(result.progress).toBeLessThan(1)
      expect(TITLES).toContain(titleFor(result.level))
      expect(later.level).toBeGreaterThanOrEqual(result.level)
    })
  })

  // **Validates: Requirements 2.2**
})

describe('TITLES: defines the progression title list', () => {
  it('contains seven titles', () => {
    expect(TITLES).toHaveLength(7)
  })
})

describe('titleFor: returns the title for a level', () => {
  it('returns Transit Rookie for level one', () => {
    expect(titleFor(1)).toBe('Transit Rookie')
  })

  it('clamps high levels to the final title', () => {
    expect(titleFor(99)).toBe('Layover Legend')
  })

  // Observed invalid behavior: titleFor(0) is undefined; app flows cannot reach this input.
})
