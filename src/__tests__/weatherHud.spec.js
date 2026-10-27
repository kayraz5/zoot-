import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, reactive, nextTick } from 'vue'

const route = reactive({ name: 'map' })
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push() {} }) }))

import { useUiStore } from '../model/stores/ui.js'
import { describeCode } from '../model/services/weather.js'
import { tick } from '../model/services/clock.js'
import { useWeatherRefresh } from '../view/composables/useWeatherRefresh.js'
import WeatherChip from '../view/components/WeatherChip.vue'
import MapStatusStack from '../view/components/MapStatusStack.vue'
import MapMenuButton from '../view/components/MapMenuButton.vue'
import SkyEffects from '../view/components/SkyEffects.vue'
import RainOverlay from '../view/components/RainOverlay.vue'

const SGT_NOON = Date.parse('2026-10-23T04:00:00Z') // 12:00 SGT
const SGT_NIGHT = Date.parse('2026-10-23T14:00:00Z') // 22:00 SGT
const forecast = (code, mm = 0, prob = 0, ms = SGT_NOON) => ({
  current: { temp: 30.4, code, mm },
  hours: [{ ms: ms - 1800000, prob, mm, temp: 30, code }]
})

let ui
enableAutoUnmount(afterEach)
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  ui = useUiStore()
  route.name = 'map'
  tick.value = SGT_NOON
})
afterEach(() => vi.useRealTimers())

describe('describeCode', () => {
  it('returns { label, icon } objects', () => {
    expect(describeCode(0)).toEqual({ label: 'Clear', icon: 'bi-sun' })
    expect(describeCode(95).icon).toBe('bi-cloud-lightning-rain')
    expect(describeCode(9999).icon).toBe('bi-cloud')
  })
})

describe('ui store: haze + lightning', () => {
  it('forced values override the real ones and persist', () => {
    expect(ui.shownHaze).toBe(null)
    ui.setForceHaze(true)
    ui.setForceLightning(true)
    expect(ui.shownHaze.psi).toBe(160)
    expect(ui.shownLightning.nearby).toBe(true)
    setActivePinia(createPinia())
    const fresh = useUiStore() // a reload / navigation
    expect(fresh.forceHaze).toBe(true)
    expect(fresh.forceLightning).toBe(true)
  })
})

describe('WeatherChip', () => {
  // The weather icon is the <i> in the second-to-last item when a face is shown, otherwise the last item.
  const icon = (w) => w.findAll('.item').at(-(w.find('svg.face').exists() ? 2 : 1)).find('i').classes().find((c) => c !== 'bi')

  it('renders nothing until data exists', () => {
    expect(mount(WeatherChip).find('.wx').exists()).toBe(false)
  })
  it('day: sun / cloud-sun; night: moon variants; boundaries at 07:00 and 19:00 SGT', () => {
    ui.weather = forecast(0)
    expect(icon(mount(WeatherChip))).toBe('bi-sun')
    ui.weather = forecast(2)
    expect(icon(mount(WeatherChip))).toBe('bi-cloud-sun')
    tick.value = SGT_NIGHT
    expect(icon(mount(WeatherChip))).toBe('bi-cloud-moon')
    ui.weather = forecast(0)
    const at = (iso) => { tick.value = Date.parse(iso); return icon(mount(WeatherChip)) }
    expect(at('2026-10-22T22:59:00Z')).toBe('bi-moon-stars') // 06:59
    expect(at('2026-10-22T23:00:00Z')).toBe('bi-sun') // 07:00
    expect(at('2026-10-23T10:59:00Z')).toBe('bi-sun') // 18:59
    expect(at('2026-10-23T11:00:00Z')).toBe('bi-moon-stars') // 19:00
  })
  it('rain, rain on a sunny code, and lightning combinations', () => {
    ui.weather = forecast(61, 2.5, 80)
    const w = mount(WeatherChip)
    expect(icon(w)).toBe('bi-cloud-rain')
    expect(w.text()).toContain('2.5 mm')
    ui.weather = forecast(0, 0.4, 20)
    expect(icon(mount(WeatherChip))).toBe('bi-cloud-rain')
    ui.weather = forecast(0)
    ui.lightning = { count: 3, nearestKm: 8, nearby: true }
    expect(icon(mount(WeatherChip))).toBe('bi-cloud-lightning')
    ui.weather = forecast(63, 2, 80)
    expect(icon(mount(WeatherChip))).toBe('bi-cloud-lightning-rain')
  })
  it('shows temperature, 0 mm and a thermometer', () => {
    ui.weather = forecast(0)
    const w = mount(WeatherChip)
    expect(w.text()).toContain('30°C')
    expect(w.text()).toContain('0 mm')
    expect(w.find('.bi-thermometer-half').exists()).toBe(true)
  })
  it('face: none / smile / mask by PSI', () => {
    ui.weather = forecast(0)
    expect(mount(WeatherChip).find('svg.face').exists()).toBe(false)
    ui.haze = { region: 'central', psi: 100, pm25: 1 }
    expect(mount(WeatherChip).find('svg.face rect').exists()).toBe(false)
    ui.haze = { region: 'central', psi: 101, pm25: 1 }
    const w = mount(WeatherChip)
    expect(w.find('svg.face rect').exists()).toBe(true)
    expect(w.text()).toContain('101')
  })
  it('dev toggles drive the chip with no forecast, and its classes never depend on the weather', () => {
    ui.setForceRain(true)
    ui.setForceHaze(true)
    ui.setForceLightning(true)
    const w = mount(WeatherChip)
    expect(icon(w)).toBe('bi-cloud-lightning-rain')
    expect(w.text()).toContain('5 mm')
    expect(w.find('svg.face rect').exists()).toBe(true)
    expect(w.find('.wx').classes()).toEqual(['wx'])
  })
})

describe('useWeatherRefresh', () => {
  it('loads on mount, refreshes every 2 minutes, and stops on unmount', () => {
    vi.useFakeTimers()
    const load = vi.spyOn(ui, 'loadWeather').mockResolvedValue(null)
    const Host = defineComponent({ setup() { useWeatherRefresh(1.29, 103.85); return () => null } })
    const w = mount(Host)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(1.29, 103.85)
    vi.advanceTimersByTime(2 * 60000)
    expect(load).toHaveBeenCalledTimes(2)
    w.unmount()
    vi.advanceTimersByTime(10 * 60000)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('MapStatusStack / MapMenuButton', () => {
  it('shows the weather chip, and the GPS button reflects and emits the demo toggle', async () => {
    ui.weather = forecast(0)
    const w = mount(MapStatusStack, { props: { demo: false }, slots: { default: '<div id="slot-probe"></div>' } })
    expect(w.find('.wx').exists()).toBe(true)
    expect(w.find('#slot-probe').exists()).toBe(true)
    const btn = w.find('button.status-demo')
    expect(btn.text()).toBe('Enable Demo-Walk')
    expect(btn.classes()).not.toContain('demo-on')
    await btn.trigger('click')
    expect(w.emitted('toggle-demo')).toHaveLength(1)
    await w.setProps({ demo: true })
    expect(btn.text()).toBe('Use Real GPS')
    expect(btn.classes()).toContain('demo-on')
  })
  it('menu button emits toggle and carries the open state', async () => {
    const w = mount(MapMenuButton, { props: { open: false } })
    expect(w.classes()).not.toContain('open')
    await w.trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
    await w.setProps({ open: true })
    expect(w.classes()).toContain('open')
  })
})

describe('SkyEffects', () => {
  it('haze only above PSI 100, only on the map, ramping smoothly', () => {
    const op = (w) => parseFloat(w.find('.haze').element.style.opacity)
    ui.haze = { region: 'central', psi: 100, pm25: 1 }
    expect(mount(SkyEffects).find('.haze').exists()).toBe(false)
    ui.haze = { region: 'central', psi: 101, pm25: 1 }
    expect(op(mount(SkyEffects))).toBeLessThan(0.05)
    ui.haze = { region: 'central', psi: 400, pm25: 1 }
    expect(op(mount(SkyEffects))).toBeCloseTo(0.95)
    route.name = 'dev'
    expect(mount(SkyEffects).find('.haze').exists()).toBe(false)
  })
  it('lightning flashes on the map and stops when switched off', async () => {
    vi.useFakeTimers()
    ui.setForceLightning(true)
    const w = mount(SkyEffects)
    vi.advanceTimersByTime(8000)
    await nextTick()
    expect(w.find('.storm .bolt').exists()).toBe(true)
    ui.setForceLightning(false)
    await nextTick()
    expect(w.find('.storm').exists()).toBe(false)
  })
})

describe('RainOverlay', () => {
  it('falls for forced rain, a high chance, or rain right now; not on other pages', () => {
    expect(mount(RainOverlay).find('.rain').exists()).toBe(false)
    ui.weather = forecast(0, 0, 30)
    expect(mount(RainOverlay).find('.rain').exists()).toBe(false)
    ui.weather = forecast(0, 0, 80)
    expect(mount(RainOverlay).find('.rain').exists()).toBe(true)
    ui.weather = forecast(0, 0.3, 10)
    expect(mount(RainOverlay).find('.rain').exists()).toBe(true)
    ui.weather = null
    ui.setForceRain(true)
    expect(mount(RainOverlay).find('.rain').exists()).toBe(true)
    route.name = 'dev'
    expect(mount(RainOverlay).find('.rain').exists()).toBe(false)
  })
})
