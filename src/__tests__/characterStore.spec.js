import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCharacterStore } from '../model/stores/character.js'
import { useCleanSlate } from './helpers/index.js'

const DEFAULTS = {
  outfit: 'zoot',
  fur: 'zoot',
  hat: 'cap',
  eyewear: 'none',
}

useCleanSlate()

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('character store initial state', () => {
  it('starts with the default character look when no look is saved', () => {
    const character = useCharacterStore()

    expect(character.outfit).toBe('zoot')
    expect(character.fur).toBe('zoot')
    expect(character.hat).toBe('cap')
    expect(character.eyewear).toBe('none')
    expect(character.savedAt).toBe(0)
  })

  it('uses defaults for saved fields that are not strings', () => {
    localStorage.setItem('zoot.character', JSON.stringify({
      outfit: 42,
      fur: null,
      hat: { name: 'beanie' },
      eyewear: true,
    }))

    const character = useCharacterStore()

    expect(character.$state).toMatchObject(DEFAULTS)
  })

  it('uses defaults when the saved character JSON is corrupt', () => {
    localStorage.setItem('zoot.character', '{not valid json')

    const character = useCharacterStore()

    expect(character.$state).toMatchObject(DEFAULTS)
  })
})

describe('character store persistence actions', () => {
  it('saves partial fields, preserves the rest, and updates savedAt', () => {
    const character = useCharacterStore()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1700000000123)

    character.save({ fur: 'fox' })

    expect(character.$state).toMatchObject({
      outfit: 'zoot',
      fur: 'fox',
      hat: 'cap',
      eyewear: 'none',
      savedAt: 1700000000123,
    })
    expect(JSON.parse(localStorage.getItem('zoot.character'))).toEqual({
      outfit: 'zoot',
      fur: 'fox',
      hat: 'cap',
      eyewear: 'none',
    })
    expect(now).toHaveBeenCalledOnce()
  })

  it('resets the character look to defaults and persists the reset', () => {
    const character = useCharacterStore()
    const now = vi.spyOn(Date, 'now')

    now.mockReturnValue(1700000000123)
    character.save({ outfit: 'rain', fur: 'grey', hat: 'beanie', eyewear: 'specs' })
    now.mockReturnValue(1700000000456)

    character.reset()

    expect(character.$state).toMatchObject({ ...DEFAULTS, savedAt: 1700000000456 })
    expect(JSON.parse(localStorage.getItem('zoot.character'))).toEqual(DEFAULTS)
  })
})
