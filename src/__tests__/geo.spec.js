import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

const loadGeo = () => import('../model/services/geo.js')

beforeEach(() => {
  vi.resetModules()
})

describe('geo: shared location state', () => {
  it('starts without a location fix', async () => {
    const { geo, hasFix } = await loadGeo()

    expect(geo).toMatchObject({ lat: null, lng: null, accuracy: null, source: null, fake: false })
    expect(hasFix()).toBe(false)
  })

  it('teleports to a point and records a precise fake fix', async () => {
    const { geo, hasFix, teleport } = await loadGeo()

    teleport({ lat: 1.3521, lng: 103.8198 })

    expect(geo).toMatchObject({
      lat: 1.3521,
      lng: 103.8198,
      accuracy: 5,
      source: 'fake',
    })
    expect(hasFix()).toBe(true)
  })

  it('enables fake mode with an optional point and clears it when disabled', async () => {
    const { geo, setFake } = await loadGeo()

    setFake(true, { lat: 1.2903, lng: 103.8519 })
    expect(geo).toMatchObject({
      lat: 1.2903,
      lng: 103.8519,
      accuracy: 5,
      source: 'fake',
      fake: true,
    })

    vi.stubGlobal('navigator', {})
    setFake(false)

    expect(geo).toEqual({ lat: null, lng: null, accuracy: null, source: null, fake: false })
  })

  it('does nothing when geolocation is unavailable', async () => {
    const { startGps } = await loadGeo()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.stubGlobal('navigator', {})
    expect(() => startGps()).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })

  it('registers one high-accuracy geolocation watch', async () => {
    const { startGps } = await loadGeo()
    const watchPosition = vi.fn(() => 42)
    vi.stubGlobal('navigator', { geolocation: { watchPosition } })

    startGps()
    startGps()

    expect(watchPosition).toHaveBeenCalledTimes(1)
    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
  })

  it('writes GPS coordinates when the watch callback receives a real fix', async () => {
    const { geo, startGps } = await loadGeo()
    let onPosition
    const watchPosition = vi.fn((success) => {
      onPosition = success
      return 1
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition } })

    startGps()
    onPosition({ coords: { latitude: 1.3001, longitude: 103.8002, accuracy: 12 } })

    expect(geo).toMatchObject({
      lat: 1.3001,
      lng: 103.8002,
      accuracy: 12,
      source: 'gps',
      fake: false,
    })
  })

  it('ignores watch callbacks while fake mode is active', async () => {
    const { geo, setFake, startGps } = await loadGeo()
    let onPosition
    const watchPosition = vi.fn((success) => {
      onPosition = success
      return 1
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition } })

    setFake(true, { lat: 1.2805, lng: 103.8448 })
    startGps()
    onPosition({ coords: { latitude: 1.4001, longitude: 103.9002, accuracy: 2 } })

    expect(geo).toMatchObject({
      lat: 1.2805,
      lng: 103.8448,
      accuracy: 5,
      source: 'fake',
      fake: true,
    })
  })
})
