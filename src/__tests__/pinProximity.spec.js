import { describe, expect, it, vi } from 'vitest'
import { updatePinProximity } from '../view/features/map/pinPoint.js'

describe('updatePinProximity', () => {
  it('turns on the close animation only for pins within the radius', () => {
    const near = { lat: 1.3, lng: 103.8, setNear: vi.fn() }
    const far = { lat: 1.4, lng: 103.9, setNear: vi.fn() }
    const pins = new Map([
      ['near', near],
      ['far', far]
    ])

    updatePinProximity(pins, { lat: 1.3001, lng: 103.8001 }, 90)

    expect(near.setNear).toHaveBeenCalledWith(true)
    expect(far.setNear).toHaveBeenCalledWith(false)
  })

  it('uses a custom radius', () => {
    const pin = { lat: 1.3, lng: 103.801, setNear: vi.fn() } // ~111 m east
    const pins = new Map([['pin', pin]])

    updatePinProximity(pins, { lat: 1.3, lng: 103.8 }, 50)
    expect(pin.setNear).toHaveBeenLastCalledWith(false)

    updatePinProximity(pins, { lat: 1.3, lng: 103.8 }, 150)
    expect(pin.setNear).toHaveBeenLastCalledWith(true)
  })

  it('clears the close state when there is no position', () => {
    const pin = { lat: 1.3, lng: 103.8, setNear: vi.fn() }
    updatePinProximity(new Map([['pin', pin]]), null)
    expect(pin.setNear).toHaveBeenCalledWith(false)
  })
})
