import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StopRangePicker from '../view/components/StopRangePicker.vue'

const at = (hhmm) => `2026-10-21T${hhmm}:00+08:00`
const stops = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ name, place_id: name, arrive_iso: at(`1${i}:00`), depart_iso: at(`1${i}:40`) }))

/** Mount with v-model wired up, so each emitted value becomes the next state. */
function picker(from, to, props = {}) {
  const w = mount(StopRangePicker, {
    props: { stops, modelValue: { from, to }, ...props, 'onUpdate:modelValue': (v) => w.setProps({ modelValue: v }) }
  })
  return w
}
const range = (w) => w.props('modelValue')
const tap = async (w, n) => w.findAll('button.stop')[n - 1].trigger('click')
const selected = (w) => w.findAll('button.stop').map((b, i) => (b.classes('in') ? i + 1 : null)).filter(Boolean)

describe('StopRangePicker: always one run of consecutive stops', () => {
  it('tapping outside the range extends it (no holes possible)', async () => {
    const w = picker(2, 2)
    await tap(w, 4)
    expect(range(w)).toEqual({ from: 2, to: 4 })
    expect(selected(w)).toEqual([2, 3, 4])
    await tap(w, 1)
    expect(range(w)).toEqual({ from: 1, to: 4 })
  })

  it('tapping an end shrinks it; tapping the middle keeps just that stop', async () => {
    const w = picker(1, 5)
    await tap(w, 1)
    expect(range(w)).toEqual({ from: 2, to: 5 })
    await tap(w, 5)
    expect(range(w)).toEqual({ from: 2, to: 4 })
    await tap(w, 3)
    expect(range(w)).toEqual({ from: 3, to: 3 })
  })

  it('handles cannot cross: dragging "from" past "to" drags "to" along', async () => {
    const w = picker(1, 2)
    const [fromHandle, toHandle] = w.findAll('input.handle')
    await fromHandle.setValue('4')
    expect(range(w)).toEqual({ from: 4, to: 4 })
    await toHandle.setValue('2')
    expect(range(w)).toEqual({ from: 2, to: 2 })
  })

  it('maxTo locks later stops (e.g. they end too late for my flight)', async () => {
    const w = picker(1, 2, { maxTo: 3 })
    await tap(w, 5)
    expect(range(w)).toEqual({ from: 1, to: 2 })
    expect(w.findAll('button.stop')[4].attributes('disabled')).toBeDefined()
    await w.find('button.btn-link').trigger('click') // "All that fit"
    expect(range(w)).toEqual({ from: 1, to: 3 })
  })

  it('summary reads naturally', async () => {
    expect(picker(1, 5).text()).toContain('All 5 stops · 10:00–14:40')
    expect(picker(2, 3).text()).toContain('Stops 2–3 · 11:00–12:40')
    expect(picker(4, 4).text()).toContain('Stop 4 · 13:00–13:40')
  })
})
