import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const at = (min) => new Date(Date.now() + min * 60000).toISOString()
const roster = [
  { user_id: 'mei', display_name: 'Mei', role: 'host' },
  { user_id: 'me', display_name: 'Eudale', role: 'member' }
]
let sent = []
// No database in unit tests: a fake quest with a few messages.
vi.mock('../model/services/social.js', async (orig) => ({
  ...(await orig()),
  getQuest: vi.fn(async (id) => ({ id, title: 'Chinatown', status: 'open', ends_at: at(120), roster })),
  listMessages: vi.fn(async (id) => [
    { id: 1, party_id: id, user_id: null, type: 'system', body: 'Eudale joined for Maxwell Food Centre', created_at: at(-30) },
    { id: 2, party_id: id, user_id: 'mei', type: 'text', body: "I'm wearing a yellow cap", created_at: at(-20) },
    { id: 3, party_id: id, user_id: null, type: 'system', body: '🤝 Mei & Eudale earned a co-op stamp at Maxwell Food Centre (+20% XP)', meta: { kind: 'coop' }, created_at: at(-10) }
  ]),
  watchMessages: vi.fn(async () => () => {}),
  sendMessage: vi.fn(async (partyId, body, type) => {
    const m = { id: 100 + sent.length, party_id: partyId, user_id: 'me', type, body, created_at: new Date().toISOString() }
    sent.push(m)
    return m
  }),
  blockUser: vi.fn(async () => {}),
  reportUser: vi.fn(async () => {}),
  coopUnseen: vi.fn(async () => []),
  markCoopSeen: vi.fn(async () => {}),
  myProfile: vi.fn(async () => ({ id: 'me', xp: 514 }))
}))

import * as social from '../model/services/social.js'
import QuestChatDrawer from '../view/components/QuestChatDrawer.vue'
import { usePartyStore } from '../model/stores/party.js'
import { useUserStore } from '../model/stores/user.js'
import { useUiStore } from '../model/stores/ui.js'

function setup() {
  setActivePinia(createPinia())
  useUserStore().session = { user: { id: 'me' } }
  try { localStorage.clear() } catch {}
  return usePartyStore()
}
const mountDrawer = () => mount(QuestChatDrawer, { props: { open: true, partyId: 'q1' }, global: { stubs: { Teleport: true } } })

describe('Quest chat drawer', () => {
  beforeEach(() => { sent = []; vi.clearAllMocks() })

  it('shows messages, system lines (co-op highlighted) and who said what', async () => {
    setup()
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain("I'm wearing a yellow cap")
    expect(w.text()).toContain('Mei')
    expect(w.find('.sys.coop').text()).toContain('co-op stamp')
  })

  it('quick replies send as chips; typed messages as text', async () => {
    const party = setup()
    const w = mountDrawer()
    await flushPromises()
    await w.findAll('.chips button').find((b) => b.text() === 'On my way').trigger('click')
    await w.find('input').setValue('See you at the queue')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sent.map((m) => [m.type, m.body])).toEqual([['chip', 'On my way'], ['text', 'See you at the queue']])
    expect(party.chat.messages.at(-1).body).toBe('See you at the queue')
  })

  it('read-only once the quest has ended', async () => {
    setup()
    social.getQuest.mockResolvedValueOnce({ id: 'q1', title: 'Chinatown', status: 'open', ends_at: at(-60), roster })
    const w = mountDrawer()
    await flushPromises()
    expect(w.find('form').exists()).toBe(false)
    expect(w.text()).toContain('read-only')
  })

  it('unread counts other people\'s messages since I last opened the chat', async () => {
    const party = setup()
    await party.startChat('q1')
    expect(party.unread).toBe(1) // Mei's message (system lines don't count)
    party.markChatRead()
    party.addMessage({ id: 9, party_id: 'q1', user_id: 'mei', type: 'chip', body: 'Running 5 min late', created_at: at(1) })
    expect(party.unread).toBe(1)
  })

  it('blocking hides their messages at once', async () => {
    const party = setup()
    await party.startChat('q1')
    await party.block('mei')
    expect(social.blockUser).toHaveBeenCalledWith('mei')
    expect(party.chat.messages.some((m) => m.user_id === 'mei')).toBe(false)
  })
})

describe('Centred prompts and co-op stamps', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a second prompt waits its turn instead of cancelling the first', async () => {
    const party = setup()
    const first = party.ask({ title: 'Go solo?' })
    const second = party.notice({ title: 'Co-op stamp!' })
    await flushPromises()
    expect(party.dialog.title).toBe('Go solo?')
    party.answer(true)
    expect(await first).toBe(true)
    await flushPromises()
    expect(party.dialog.title).toBe('Co-op stamp!')
    party.answer(true)
    expect(await second).toBe(true)
  })

  it('co-op notice waits for the stamp celebration, then shows who and the bonus, and refreshes XP', async () => {
    const party = setup()
    const ui = useUiStore()
    ui.celebration = { place: { id: 'maxwell-food-centre' } }
    social.coopUnseen.mockResolvedValueOnce([{ id: 7, place_name: 'Maxwell Food Centre', partners: 'Mei', bonus_xp: 14 }])
    const done = party.checkCoop()
    await flushPromises()
    expect(party.dialog).toBe(null) // still celebrating
    ui.celebration = null
    await flushPromises()
    expect(party.dialog.body).toBe('You and Mei were both at Maxwell Food Centre for the first time. +14 bonus XP each.')
    expect(social.markCoopSeen).toHaveBeenCalledWith([7])
    party.answer(true)
    await done
    expect(useUserStore().profile.xp).toBe(514)
  })
})
