import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

beforeEach(() => {
  vi.resetModules()
})

const loadBrand = () => import('../model/services/brand.js')

describe('onColor: chooses readable cover text', () => {
  it('uses ink on a light yellow cover', async () => {
    const { BRAND, onColor } = await loadBrand()

    expect(onColor(BRAND.yellow)).toBe(BRAND.ink)
  })

  it('uses yellow on a dark ink cover', async () => {
    const { BRAND, onColor } = await loadBrand()

    expect(onColor(BRAND.ink)).toBe(BRAND.yellow)
  })

  it('uses ink for the default cover when no color is provided', async () => {
    const { BRAND, DEFAULT_COVER, onColor } = await loadBrand()

    expect(onColor()).toBe(BRAND.ink)
    expect(DEFAULT_COVER).toBe(BRAND.yellow)
  })

  it('falls back to yellow for an invalid color value', async () => {
    const { BRAND, onColor } = await loadBrand()

    // Observed invalid behavior: parseInt produces NaN and the bitwise luminance
    // calculation treats it as dark; app flows provide valid hex colors.
    expect(onColor('#zzz')).toBe(BRAND.yellow)
  })
})

describe('passport cover constants', () => {
  it('uses the first cover as the default cover', async () => {
    const { COVERS, DEFAULT_COVER } = await loadBrand()

    expect(COVERS[0]).toBe(DEFAULT_COVER)
    expect(COVERS).toEqual(['#ffcc00', '#111111', '#f83878', '#fff4c2', '#ff4d00', '#ffffff'])
  })
})
