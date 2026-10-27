import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// No database in unit tests: the chip's network calls just fail quietly.
vi.mock('../model/services/social.js', async (orig) => ({
  ...(await orig()),
  getQuest: vi.fn(async () => null),
  listLocations: vi.fn(async () => []),
  watchLocations: vi.fn(async () => () => {}),
  getHostedWindow: vi.fn(async () => null),
  leaveWindow: vi.fn(async () => {})
}))

vi.mock('../model/services/db/index.js', () => ({ getDb: async () => ({ kind: 'local', saveMission: async () => {} }) }))

import QuestCoopChip from '../view/components/QuestCoopChip.vue'
import QuestMapLive from '../view/components/QuestMapLive.vue'
import QuestChatButton from '../view/components/QuestChatButton.vue'
import QuestGoSolo from '../view/components/QuestGoSolo.vue'
import { useMissionStore } from '../model/stores/mission.js'
import { usePartyStore } from '../model/stores/party.js'

const min = (n) => new Date(Date.now() + n * 60000).toISOString()
const leg = (place_id, a, d, extra = {}) => ({ kind: 'visit', status: 'pending', place_id, name: place_id, lat: 1.28, lng: 103.84, arrive_iso: min(a), depart_iso: min(d), ...extra })
const block = (place_id, a, d) => leg(place_id, a, d, { fixed: true, party_id: 'q1', with_host: 'Mei' })

function setup(legs) {
  setActivePinia(createPinia())
  const store = useMissionStore()
  store.mission = {
    id: 'm1', origin: { label: 'Changi Airport', lat: 1.3644, lng: 103.9915 }, start_iso: min(-120), must_return_iso: min(700), buffers: { exit_min: 30 }, prefs: {}, legs: [...legs, { kind: 'return', status: 'pending', arrive_by: min(600) }],
    joined: { q1: { title: 'Chinatown', host_name: 'Mei', from: 1, to: 2, removed: [] } }
  }
  const w = mount(QuestCoopChip, { global: { stubs: { RouterLink: true } } })
  return { w, store }
}

describe('QuestCoopChip: the map HUD while I am with someone', () => {
  beforeEach(() => vi.clearAllMocks())

  it('during the joined stops: one line, "With Mei until …"', async () => {
    const { w } = setup([block('maxwell', -10, 30), block('temple', 35, 60), leg('gardens', 90, 150)])
    await flushPromises()
    expect(w.text()).toMatch(/^With Mei until \d\d:\d\d$/)
  })

  it('before the meet-up: one line, where and when to meet (no subtext)', async () => {
    const { w } = setup([block('maxwell', 40, 80)])
    await flushPromises()
    expect(w.text()).toMatch(/^Meet Mei at maxwell, \d\d:\d\d$/)
  })

  it('card buttons: "Chat with Mei" opens the chat; Go solo shows for guests', async () => {
    setup([block('maxwell', 40, 80)])
    const chat = mount(QuestChatButton)
    const solo = mount(QuestGoSolo)
    expect(chat.text()).toContain('Chat with Mei')
    expect(solo.text()).toBe('Go solo')
    await chat.find('button').trigger('click')
    expect(usePartyStore().chatPanel).toBe('q1')
  })

  it('not in a quest → nothing shown', async () => {
    const { w, store } = setup([leg('gardens', 10, 60)])
    store.mission.joined = {}
    await flushPromises()
    expect(w.text()).toBe('')
  })

  it('when my joined stops are over, I am back on my own plan (removed stops that still fit come back)', async () => {
    const { store } = setup([block('maxwell', -60, -5), leg('gardens', 90, 150)])
    store.mission.joined.q1.removed = [{ ...leg('museum', 30, 60), removed_why: 'gap' }]
    const done = store.finishEndedQuests()
    await flushPromises()
    // The "Your stops with Mei are done" prompt waits for the traveller to acknowledge it.
    const party = usePartyStore()
    expect(party.dialog.title).toBe('Your stops with Mei are done')
    party.answer(true)
    await done
    expect(store.mission.joined).toEqual({})
    expect(store.legs.filter((l) => l.kind === 'visit').map((l) => l.place_id)).toEqual(['museum', 'gardens'])
  })

  it('the always-on map layer returns me to my own plan by itself when my stops end', async () => {
    const { store } = setup([block('maxwell', -60, -5), leg('gardens', 90, 150)])
    mount(QuestMapLive, { props: { getMap: () => null } })
    await flushPromises()
    const party = usePartyStore()
    expect(party.dialog?.title).toBe('Your stops with Mei are done')
    party.answer(true)
    await flushPromises()
    expect(store.mission.joined).toEqual({})
  })
})
