import { it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CenterDialog from '../view/components/CenterDialog.vue'
import { usePartyStore } from '../model/stores/party.js'

it('centred prompt: shows, then resolves with the answer', async () => {
  setActivePinia(createPinia())
  const w = mount(CenterDialog, { global: { stubs: { Teleport: true } } })
  const party = usePartyStore()
  const answer = party.ask({ title: 'Go solo?', body: "You'll leave Mei's quest.", confirmText: 'Go solo', cancelText: 'Stay' })
  await flushPromises()
  expect(w.text()).toContain('Go solo?')
  await w.findAll('button').find((b) => b.text() === 'Stay').trigger('click')
  expect(await answer).toBe(false)
  expect(w.text()).toBe('')
})
