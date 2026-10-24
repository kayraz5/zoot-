import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '../model/stores/user.js'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('user store initial state and getters', () => {
  it('starts signed out with the local mode defaults', () => {
    const user = useUserStore()

    expect(user.session).toBeNull()
    expect(user.profile).toBeNull()
    expect(user.ready).toBe(false)
    expect(user.mode).toBe('local')
    expect(user.isAuthed).toBe(false)
    expect(user.userId).toBeNull()
    expect(user.needsOnboarding).toBe(false)
    expect(user.level).toMatchObject({ level: 1 })
    expect(user.title).toBe('Transit Rookie')
    expect(user.canUseEmail).toBe(false)
  })
})

describe('user store initialization', () => {
  it('memoizes local initialization and marks the store ready', async () => {
    const user = useUserStore()
    const firstInit = user.init()
    const secondInit = user.init()

    expect(secondInit).toBe(firstInit)
    await firstInit

    expect(user.mode).toBe('local')
    expect(user.ready).toBe(true)
    expect(user.session).toBeNull()
    expect(user.profile).toBeNull()
  })
})

describe('guest account actions', () => {
  it('continues as a guest and reports onboarding and level information', async () => {
    const user = useUserStore()

    await user.continueAsGuest('Mei')

    expect(user.isAuthed).toBe(true)
    expect(user.userId).toMatch(/^guest-/)
    expect(user.profile.display_name).toBe('Mei')
    expect(user.needsOnboarding).toBe(true)
    expect(user.level.level).toBe(1)
    expect(user.title).toBe('Transit Rookie')
    expect(JSON.parse(localStorage.getItem('zoot.session'))).toEqual(user.session)
  })

  it('clears onboarding after updating a guest profile style', async () => {
    const user = useUserStore()
    await user.continueAsGuest('Mei')

    await user.updateProfile({ style: 'budget' })

    expect(user.profile.style).toBe('budget')
    expect(user.needsOnboarding).toBe(false)
    expect(JSON.parse(localStorage.getItem('zoot.profile'))).toMatchObject({
      id: user.userId,
      display_name: 'Mei',
      style: 'budget',
    })
  })

  it('leaves the current profile unchanged when setProfile receives null', async () => {
    const user = useUserStore()
    await user.continueAsGuest('Mei')
    const profile = user.profile

    user.setProfile(null)

    expect(user.profile).toBe(profile)
  })

  it('rejects password authentication in guest mode with the Supabase message', async () => {
    const user = useUserStore()

    await expect(user.passwordAuth('mei@example.test', 'secret')).rejects.toThrow(
      'Password sign-in needs Supabase keys. Use guest mode for now.',
    )
  })

  it('clears signed-in state and the guest session from storage on sign out', async () => {
    const user = useUserStore()
    await user.continueAsGuest('Mei')

    await user.signOut()

    expect(user.session).toBeNull()
    expect(user.profile).toBeNull()
    expect(user.isAuthed).toBe(false)
    expect(user.userId).toBeNull()
    expect(localStorage.getItem('zoot.session')).toBeNull()
    expect(localStorage.getItem('zoot.profile')).not.toBeNull()
  })
})
