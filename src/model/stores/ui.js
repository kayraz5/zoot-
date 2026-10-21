import { defineStore } from 'pinia'
import { fetchForecast, fetchHaze, fetchLightning } from '../services/weather.js'

/** Theme, toasts, celebrations, weather and dev flags (Matthew + Hulbert lanes). */
const DEV_PSI = 160 // "Unhealthy" level, used when haze is forced on

export const useUiStore = defineStore('ui', {
	state: () => ({
		theme: document.documentElement.getAttribute('data-bs-theme') || 'light',
		forceRain: readFlag('zoot.forceRain'),
		toasts: [],
		celebration: null,
		weather: null,
		weatherError: null,
		haze: null,
		lightning: null,
		forceHaze: readFlag('zoot.forceHaze'),
		forceLightning: readFlag('zoot.forceLightning')
	}),
	getters: {
		// The haze reading to show: fake when forced, real otherwise.
		shownHaze(state) {
			if (state.forceHaze) return { region: 'dev', psi: DEV_PSI, pm25: 80 }
			return state.haze
		},
		// The lightning reading to show: a close strike when forced.
		shownLightning(state) {
			if (state.forceLightning) return { count: 12, nearestKm: 3, nearby: true }
			return state.lightning
		}
	},
	actions: {
		toggleTheme() {
			this.theme = this.theme === 'dark' ? 'light' : 'dark'
			document.documentElement.setAttribute('data-bs-theme', this.theme)
			try { localStorage.setItem('zoot.theme', this.theme) } catch { }
		},
		setForceRain(on) {
			this.forceRain = on
			try { localStorage.setItem('zoot.forceRain', on ? '1' : '0') } catch { }
		},
				setForceHaze(on) {
			this.forceHaze = on
			try { localStorage.setItem('zoot.forceHaze', on ? '1' : '0') } catch { }
		},
		setForceLightning(on) {
			this.forceLightning = on
			try { localStorage.setItem('zoot.forceLightning', on ? '1' : '0') } catch { }
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
			if (haze.status === 'fulfilled') this.haze = haze.value
			if (lightning.status === 'fulfilled') this.lightning = lightning.value

			return this.weather
    	}
	}
})

function readFlag(key) {
	try { return localStorage.getItem(key) === '1' } catch { return false }
}