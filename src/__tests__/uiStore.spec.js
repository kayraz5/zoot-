import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../model/stores/ui.js'
import { useCleanSlate } from './helpers/index.js'

const weather = vi.hoisted(() => ({
  fetchForecast: vi.fn(),
  fetchHaze: vi.fn(),
  fetchLightning: vi.fn(),
}))

vi.mock('../model/services/weather.js', () => weather)

useCleanSlate()

afterEach(() => {
  document.documentElement.removeAttribute('data-bs-theme')
})

beforeEach(() => {
  setActivePinia(createPinia())
  document.documentElement.removeAttribute('data-bs-theme')
})

describe('ui store initial state', () => {
  it('reads the theme attribute and force-rain flag from the browser', () => {
    document.documentElement.setAttribute('data-bs-theme', 'dark')
    localStorage.setItem('zoot.forceRain', '1')

    const store = useUiStore()

    expect(store.theme).toBe('dark')
    expect(store.forceRain).toBe(true)
    expect(store.toasts).toEqual([])
    expect(store.celebration).toBeNull()
    expect(store.weather).toBeNull()
    expect(store.weatherError).toBeNull()
  })

  it('defaults to a light theme and disabled force-rain flag when settings are absent', () => {
    const store = useUiStore()

    expect(store.theme).toBe('light')
    expect(store.forceRain).toBe(false)
  })
})

describe('ui store preferences and notifications', () => {
  it('toggles the theme and updates the document attribute and storage', () => {
    const store = useUiStore()

    store.toggleTheme()
    expect(store.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark')
    expect(localStorage.getItem('zoot.theme')).toBe('dark')

    store.toggleTheme()
    expect(store.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light')
    expect(localStorage.getItem('zoot.theme')).toBe('light')
  })

  it('sets force-rain state and persists its enabled value', () => {
    const store = useUiStore()

    store.setForceRain(true)
    expect(store.forceRain).toBe(true)
    expect(localStorage.getItem('zoot.forceRain')).toBe('1')

    store.setForceRain(false)
    expect(store.forceRain).toBe(false)
    expect(localStorage.getItem('zoot.forceRain')).toBe('0')
  })

  it('adds a toast and removes it after the requested duration', () => {
    vi.useFakeTimers()
    const store = useUiStore()

    store.toast('Saved successfully', 'success', 1000)

    expect(store.toasts).toHaveLength(1)
    expect(store.toasts[0]).toMatchObject({
      message: 'Saved successfully',
      variant: 'success',
    })
    expect(store.toasts[0].id).toEqual(expect.any(String))

    vi.advanceTimersByTime(999)
    expect(store.toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(store.toasts).toEqual([])
  })

  it('stores celebration payloads for the celebration UI', () => {
    const store = useUiStore()
    const payload = { place: { id: 'gardens' }, xp: 25, area: 'Central' }

    store.celebrate(payload)

    expect(store.celebration).toBe(payload)
  })
})

describe('ui store weather loading', () => {
  it('stores a successful forecast and clears an older weather error', async () => {
    const forecast = { current: { temp: 30, code: 1 }, hours: [] }
    weather.fetchForecast.mockResolvedValueOnce(forecast)
    const store = useUiStore()
    store.weatherError = 'Previous weather failure'

    await expect(store.loadWeather(1.3, 103.8)).resolves.toBe(forecast)

    expect(weather.fetchForecast).toHaveBeenCalledWith(1.3, 103.8)
    expect(store.weather).toBe(forecast)
    expect(store.weatherError).toBeNull()
  })

  it('records a forecast error while preserving the previous weather', async () => {
    const previousForecast = { current: { temp: 29, code: 2 }, hours: [] }
    weather.fetchForecast.mockRejectedValueOnce(new Error('Weather unavailable'))
    const store = useUiStore()
    store.weather = previousForecast

    await expect(store.loadWeather(1.3, 103.8)).resolves.toBe(previousForecast)

    expect(store.weather).toBe(previousForecast)
    expect(store.weatherError).toBe('Weather unavailable')
  })
})
