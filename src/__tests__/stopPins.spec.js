import { describe, expect, it, vi } from 'vitest'
import { syncStopPins } from '../view/gl/pinPoint.js'

const visit = (seq, placeId) => ({
  seq,
  place_id: placeId,
  kind: 'visit',
  lng: 103.8,
  lat: 1.3
})

const home = {
  seq: 3,
  kind: 'return',
  lng: 103.9,
  lat: 1.4
}

const fakePin = (id) => ({ id, setBadge: vi.fn() })

describe('syncStopPins', () => {
  it('labels pins with their sequence number and marks the next stop', () => {
    const legs = [visit(1, 'a'), visit(2, 'b'), home]
    const pins = new Map([
      ['1:a', fakePin('pin-1:a')],
      ['2:b', fakePin('pin-2:b')],
      ['3:home', fakePin('pin-3:home')]
    ])
    const map = { addLayer: vi.fn(), removeLayer: vi.fn() }

    syncStopPins(map, pins, legs, legs[1])

    expect(pins.get('1:a').setBadge).toHaveBeenCalledWith('1', false)
    expect(pins.get('2:b').setBadge).toHaveBeenCalledWith('2', true)
    expect(pins.get('3:home').setBadge).toHaveBeenCalledWith('home', false)
    expect(map.addLayer).not.toHaveBeenCalled()
    expect(map.removeLayer).not.toHaveBeenCalled()
  })

  it('removes pins for legs that are no longer in the mission', () => {
    const pins = new Map([['3:home', fakePin('pin-3:home')]])
    const map = { addLayer: vi.fn(), removeLayer: vi.fn() }

    syncStopPins(map, pins, [visit(1, 'a')], null)

    expect(map.removeLayer).toHaveBeenCalledWith('pin-3:home')
    expect(pins.has('3:home')).toBe(false)
  })
})
