import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jsonResponse,
  setNow,
  stubFetch,
  T,
  useCleanSlate,
} from './helpers/index.js'

useCleanSlate()

beforeEach(() => {
  vi.resetModules()
})

const loadWeather = () => import('../model/services/weather.js')

const forecastJson = {
  current: {
    temperature_2m: 28.5,
    weather_code: 2,
    precipitation: 0.1,
  },
  hourly: {
    time: ['2030-01-15T12:00', '2030-01-15T13:00'],
    precipitation_probability: [40, 60],
    precipitation: [0.2, 0.8],
    temperature_2m: [28, 28.2],
    weather_code: [61, 63],
  },
}

const psiJson = {
  data: {
    items: [{
      updatedTimestamp: '2030-01-15T04:00:00Z',
      readings: {
        psi_twenty_four_hourly: { central: 75, north: 40, east: 90 },
        pm25_twenty_four_hourly: { central: 25, north: 12, east: 30 },
      },
    }],
    regionMetadata: [
      { name: 'north', labelLocation: { latitude: 1.42, longitude: 103.82 } },
      { name: 'central', labelLocation: { latitude: 1.29, longitude: 103.85 } },
      { name: 'east', labelLocation: { latitude: 1.35, longitude: 103.95 } },
    ],
  },
}

describe('weather descriptions', () => {
  it('describes a known weather code', async () => {
    const { describeCode } = await loadWeather()

    expect(describeCode(61)).toEqual({ label: 'Rain', icon: 'bi-cloud-rain' })
  })

  it('uses the unknown weather description for an unsupported code', async () => {
    const { describeCode } = await loadWeather()

    expect(describeCode(999)).toEqual({ label: '-', icon: 'bi-cloud' })
  })

  it('describes all PSI boundary bands', async () => {
    const { describePsi } = await loadWeather()

    expect(describePsi(null)).toEqual({ label: '—', level: 'unknown' })
    expect(describePsi(50)).toEqual({ label: 'Good', level: 'good' })
    expect(describePsi(51)).toEqual({ label: 'Moderate', level: 'moderate' })
    expect(describePsi(100)).toEqual({ label: 'Moderate', level: 'moderate' })
    expect(describePsi(101)).toEqual({ label: 'Unhealthy', level: 'unhealthy' })
    expect(describePsi(200)).toEqual({ label: 'Unhealthy', level: 'unhealthy' })
    expect(describePsi(201)).toEqual({ label: 'Very unhealthy', level: 'very-unhealthy' })
    expect(describePsi(300)).toEqual({ label: 'Very unhealthy', level: 'very-unhealthy' })
    expect(describePsi(301)).toEqual({ label: 'Hazardous', level: 'hazardous' })
  })
})

describe('rain forecast lookup', () => {
  it('returns the forced heavy-rain probability', async () => {
    const { rainLookup } = await loadWeather()

    expect(rainLookup({ hours: [] }, true)(T('12:00'))).toBe(90)
  })

  it('returns zero when the forecast is null or empty', async () => {
    const { rainLookup } = await loadWeather()

    expect(rainLookup(null)(T('12:00'))).toBe(0)
    expect(rainLookup({ hours: [] })(T('12:00'))).toBe(0)
  })

  it('returns the probability for the hour containing the requested time', async () => {
    const { rainLookup } = await loadWeather()
    const forecast = {
      hours: [{ ms: T('12:00', '2030-01-15'), prob: 65 }],
    }

    expect(rainLookup(forecast)(T('12:30'))).toBe(65)
  })

  it('returns zero for a time outside the forecast hours', async () => {
    const { rainLookup } = await loadWeather()
    const forecast = {
      hours: [{ ms: T('12:00', '2030-01-15'), prob: 65 }],
    }

    expect(rainLookup(forecast)(T('11:59'))).toBe(0)
    expect(rainLookup(forecast)(T('13:00'))).toBe(0)
  })
})

describe('Open-Meteo forecast fetching', () => {
  it('rejects when Open-Meteo responds with HTTP 500', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api.open-meteo.com', () => jsonResponse({}, 500)],
    ])

    await expect(weather.fetchForecast(1.2903, 103.8519)).rejects.toThrow('Open-Meteo 500')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // Defect_Report D1 (ReferenceError: newURLSearchParams) was fixed upstream in weather.js.
  // This case is now a regression test.
  it('builds the forecast from the Open-Meteo response', async () => {
    const weather = await loadWeather()
    stubFetch([
      ['api.open-meteo.com', () => jsonResponse(forecastJson)],
    ])

    const forecast = await weather.fetchForecast(1.2903, 103.8519)

    expect(forecast).toEqual({
      current: { temp: 28.5, code: 2, mm: 0.1 },
      hours: [
        { ms: Date.parse('2030-01-15T12:00:00Z'), prob: 40, mm: 0.2, temp: 28, code: 61 },
        { ms: Date.parse('2030-01-15T13:00:00Z'), prob: 60, mm: 0.8, temp: 28.2, code: 63 },
      ],
    })
  })
})

describe('haze fetching', () => {
  it('selects the nearest PSI region and returns its readings', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/psi', () => jsonResponse(psiJson)],
    ])

    await expect(weather.fetchHaze(1.291, 103.852)).resolves.toEqual({
      region: 'central',
      psi: 75,
      pm25: 25,
      updatedAt: '2030-01-15T04:00:00Z',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects with the PSI status when the haze request fails', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/psi', () => jsonResponse({}, 500)],
    ])

    await expect(weather.fetchHaze()).rejects.toThrow('PSI 500')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the haze result for fifteen minutes before fetching again', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/psi', () => jsonResponse(psiJson)],
    ])
    setNow(T('10:00'))

    await weather.fetchHaze()
    await weather.fetchHaze()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(15 * 60 * 1000)
    await weather.fetchHaze()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('lightning fetching', () => {
  it('returns an empty result when the response has no readings', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/weather?api=lightning', () => jsonResponse({
        data: { records: [{ item: { readings: [] } }] },
      })],
    ])

    await expect(weather.fetchLightning()).resolves.toEqual({
      count: 0,
      nearestKm: null,
      nearby: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('marks a strike within fifteen kilometres as nearby', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/weather?api=lightning', () => jsonResponse({
        data: {
          records: [{
            item: {
              readings: [{ location: { latitude: '1.2903', longitude: '103.8519' } }],
            },
          }],
        },
      })],
    ])

    await expect(weather.fetchLightning(1.2903, 103.8519)).resolves.toEqual({
      count: 1,
      nearestKm: 0,
      nearby: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the lightning result for two minutes before fetching again', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/weather?api=lightning', () => jsonResponse({
        data: { records: [{ item: { readings: [] } }] },
      })],
    ])
    setNow(T('10:00'))

    await weather.fetchLightning()
    await weather.fetchLightning()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2 * 60 * 1000)
    await weather.fetchLightning()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects with the lightning status when the request fails', async () => {
    const weather = await loadWeather()
    const fetchMock = stubFetch([
      ['api-open.data.gov.sg/v2/real-time/api/weather?api=lightning', () => jsonResponse({}, 500)],
    ])

    await expect(weather.fetchLightning()).rejects.toThrow('Lightning 500')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
