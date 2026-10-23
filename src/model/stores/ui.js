import { defineStore } from 'pinia'
import { fetchForecast, fetchHaze, fetchLightning } from '../services/weather.js'

/** Theme, toasts, celebrations, weather and dev flags (Matthew + Hulbert lanes). */
const DEV_PSI = 160 // "Unhealthy" level, used when haze is forced on

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: document.documentElement.getAttribute('data-bs-theme') || 'light',
    toasts: [],
    celebration: null,
    weather: null, // latest real weather reading from Open-Meteo (current conditions + hourly rain chance)
    haze: null, // latest real PSI reading from NEA
    lightning: null, // latest real lightning reading from NEA
    weatherError: null, // error message if Open-Meteo request failed
    hazeError: null, // error message if NEA PSI request failed
    lightningError: null, // error message if NEA lightning request failed
    forceRain: readFlag('zoot.forceRain'), // dev toggle #1
    forceHaze: readFlag('zoot.forceHaze'), // dev toggle #2
    forceLightning: readFlag('zoot.forceLightning'), // dev toggle #3
    navHidden: false // set by focused flows (first-time planning) to hide the bottom nav
  }),
  getters: {
    // Haze to display: fake "Unhealthy" reading when forced, otherwise the real one
    shownHaze(state) {
      if (state.forceHaze) return { region: 'dev', psi: DEV_PSI, pm25: 80 }
      return state.haze
    },
    // Lightning to display: a fake close strike when forced, otherwise the real one
    shownLightning(state) {
      if (state.forceLightning) return { count: 12, nearestKm: 3, nearby: true }
      return state.lightning
    }
  },
  actions: {
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-bs-theme', this.theme)
      try { localStorage.setItem('zoot.theme', this.theme) } catch {}
    },
    setForceRain(on) {
      this.forceRain = on
      try { localStorage.setItem('zoot.forceRain', on ? '1' : '0') } catch {}
    },
    setForceHaze(on) {
      this.forceHaze = on
      try { localStorage.setItem('zoot.forceHaze', on ? '1' : '0') } catch {}
    },
    setForceLightning(on) {
      this.forceLightning = on
      try { localStorage.setItem('zoot.forceLightning', on ? '1' : '0') } catch {}
    },
    toast(message, variant = 'dark', ms = 3200) {
      const id = Math.random().toString(36).slice(2)
      this.toasts.push({ id, message, variant })
      setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id) }, ms)
    },
    celebrate(payload) {
      this.celebration = payload
    },
    async loadWeather(lat, lng) {
      // allSettled: one failed request doesn't stop the others
      const [forecast, haze, lightning] = await Promise.allSettled([
        fetchForecast(lat, lng),
        fetchHaze(lat, lng),
        fetchLightning(lat, lng)
      ])

      if (forecast.status === 'fulfilled') {
        this.weather = forecast.value
        this.weatherError = null
      } else {
        this.weatherError = forecast.reason.message
      }
      if (haze.status === 'fulfilled') {
        this.haze = haze.value
        this.hazeError = null
      } else {
        this.hazeError = haze.reason.message
      }
      if (lightning.status === 'fulfilled') {
        this.lightning = lightning.value
        this.lightningError = null
      } else {
        this.lightningError = lightning.reason.message
      }


      return this.weather
    }
  }
})

function readFlag(key) {
	try { return localStorage.getItem(key) === '1' } catch { return false }
}