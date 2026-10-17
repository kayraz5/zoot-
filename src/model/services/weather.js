import { CITY } from './config.js'

/**
 * Open-Meteo hourly forecast (free, no key). Hulbert's lane.
 * Returns a lookup rainAt(ms) → precipitation probability 0..100.
 */
const CODES = {
  0: ['Clear', 'bi-sun'], 1: ['Mostly clear', 'bi-sun'], 2: ['Partly cloudy', 'bi-cloud-sun'], 3: ['Overcast', 'bi-cloud'],
  45: ['Fog', 'bi-cloud-fog'], 48: ['Fog', 'bi-cloud-fog'], 51: ['Drizzle', 'bi-cloud-drizzle'], 53: ['Drizzle', 'bi-cloud-drizzle'],
  55: ['Drizzle', 'bi-cloud-drizzle'], 61: ['Rain', 'bi-cloud-rain'], 63: ['Rain', 'bi-cloud-rain'], 65: ['Heavy rain', 'bi-cloud-rain-heavy'],
  80: ['Showers', 'bi-cloud-rain'], 81: ['Showers', 'bi-cloud-rain-heavy'], 82: ['Violent showers', 'bi-cloud-rain-heavy'],
  95: ['Thunderstorm', 'bi-cloud-lightning-rain'], 96: ['Thunderstorm', 'bi-cloud-lightning-rain'], 99: ['Thunderstorm', 'bi-cloud-lightning-rain']
}

export function describeCode(code) {
  const [label, icon] = CODES[code] || ['—', 'bi-cloud']
  return { label, icon }
}

const cache = new Map()

export async function fetchForecast(lat = CITY.lat, lng = CITY.lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15 * 60000) return hit.data
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: lat, longitude: lng, timezone: 'UTC', forecast_days: 2,
    hourly: 'precipitation_probability,precipitation,temperature_2m,weather_code',
    current: 'temperature_2m,weather_code,precipitation'
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const json = await res.json()
  const hours = json.hourly.time.map((t, i) => ({
    ms: Date.parse(t + 'Z'),
    prob: json.hourly.precipitation_probability[i] ?? 0,
    mm: json.hourly.precipitation[i] ?? 0,
    temp: json.hourly.temperature_2m[i],
    code: json.hourly.weather_code[i]
  }))
  const data = {
    current: { temp: json.current.temperature_2m, code: json.current.weather_code, mm: json.current.precipitation },
    hours
  }
  cache.set(key, { at: Date.now(), data })
  return data
}

/** Build rainAt(ms) from a forecast; with force=true every hour is a downpour (dev panel). */
export function rainLookup(forecast, force = false) {
  if (force) return () => 90
  if (!forecast?.hours?.length) return () => 0
  return (ms) => {
    const h = forecast.hours.find((x) => ms >= x.ms && ms < x.ms + 3600000)
    return h ? h.prob : 0
  }
}
