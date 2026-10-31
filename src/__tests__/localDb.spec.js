import { describe, expect, it, vi } from 'vitest'
import { at, setNow, T, useCleanSlate } from './helpers/index.js'
import { localDb } from '../model/services/db/local.js'

useCleanSlate()

describe('localDb guest authentication and profiles', () => {
  it('creates a guest profile and renames it on a later sign-in', async () => {
    setNow(T('09:00'))

    const first = await localDb.signInGuest('Ari')
    const firstProfile = JSON.parse(localStorage.getItem('zoot.profile'))
    const second = await localDb.signInGuest('Bea')

    expect(first).toEqual({ user: { id: firstProfile.id, email: null }, guest: true })
    expect(second).toEqual(first)
    expect(firstProfile.id).toMatch(/^guest-/)
    expect(JSON.parse(localStorage.getItem('zoot.profile'))).toMatchObject({
      id: firstProfile.id,
      display_name: 'Bea',
      xp: 0,
      style: null,
      created_at: new Date(T('09:00')).toISOString(),
    })
    expect(await localDb.getSession()).toEqual(second)
  })

  it('rejects email and password authentication methods without Supabase keys', async () => {
    await expect(localDb.signInWithEmail()).rejects.toThrow('needs Supabase keys')
    await expect(localDb.signInWithPassword()).rejects.toThrow('needs Supabase keys')
    await expect(localDb.signUpWithPassword()).rejects.toThrow('needs Supabase keys')
  })

  it('returns no session after signing out', async () => {
    await localDb.signInGuest('Ari')
    await localDb.signOut()

    expect(await localDb.getSession()).toBeNull()
    expect(localStorage.getItem('zoot.session')).toBeNull()
  })

  it('merges profile updates and awards XP only to the matching profile', async () => {
    const { user } = await localDb.signInGuest('Ari')

    const updated = await localDb.updateProfile(user.id, { style: 'budget', home_city: 'Singapore' })
    expect(updated).toMatchObject({
      id: user.id,
      display_name: 'Ari',
      style: 'budget',
      home_city: 'Singapore',
    })

    expect(await localDb.awardXp(user.id, 35)).toMatchObject({ id: user.id, xp: 35 })
    expect(await localDb.awardXp('another-user', 100)).toBeNull()
    expect(await localDb.getProfile('another-user')).toBeNull()
    expect(await localDb.getProfile(user.id)).toMatchObject({ style: 'budget', xp: 35 })
  })
})

describe('localDb trips and missions', () => {
  it('returns an empty place list for guest mode', async () => {
    expect(await localDb.listPlaces()).toEqual([])
  })

  it('assigns trip ids, puts the newest trip first, replaces duplicate ids, and caps history', async () => {
    setNow(T('00:00'))
    const generated = await localDb.saveTrip({ title: 'generated' })
    expect(generated.id).toEqual(expect.any(String))

    await localDb.saveTrip({ id: 'trip-1', title: 'original' })
    const replacement = await localDb.saveTrip({ id: 'trip-1', title: 'replacement' })
    expect(replacement.id).toBe('trip-1')
    expect(JSON.parse(localStorage.getItem('zoot.trips'))[0]).toMatchObject({
      id: 'trip-1',
      title: 'replacement',
    })

    for (let index = 2; index <= 22; index += 1) {
      vi.setSystemTime(T(`${String(index).padStart(2, '0')}:00`))
      await localDb.saveTrip({ id: `trip-${index}`, title: `Trip ${index}` })
    }

    const trips = JSON.parse(localStorage.getItem('zoot.trips'))
    expect(trips).toHaveLength(21)
    expect(trips[0]).toMatchObject({ id: 'trip-22', title: 'Trip 22' })
    expect(trips.find((trip) => trip.id === 'trip-1')).toBeUndefined()
    expect(trips.find((trip) => trip.id === generated.id)).toBeUndefined()
  })

  it('saves missions, retrieves them by id, and lists newest missions first', async () => {
    const older = { id: 'mission-old', created_at: at('10:00'), title: 'Older' }
    const newer = { id: 'mission-new', created_at: at('11:00'), title: 'Newer' }

    await localDb.saveMission(older)
    await localDb.saveMission(newer)

    expect(await localDb.getMission('mission-new')).toEqual(newer)
    expect(await localDb.getMission('missing')).toBeNull()
    expect(await localDb.listMissions()).toEqual([newer, older])
  })
})

describe('localDb stamps and geofencing', () => {
  const place = { id: 'merlion', lat: 1.2868, lng: 103.8545, area: 'Marina Bay' }
  const position = { lat: place.lat, lng: place.lng, accuracy: 5 }

  it('rejects a distant stamp, allows the dev bypass, rejects same-day duplicates, and awards XP after rollover', async () => {
    setNow(T('23:30'))
    const { user } = await localDb.signInGuest('Stamp User')
    const common = { userId: user.id, place, missionId: 'mission-1', xp: 20 }

    await expect(localDb.stampPlace({
      ...common,
      position: { lat: 1.3000, lng: 103.9000, accuracy: 5 },
      fake: false,
      dev: false,
    })).rejects.toThrow(/away/)

    const first = await localDb.stampPlace({
      ...common,
      position: { lat: 1.3000, lng: 103.9000, accuracy: 5 },
      fake: false,
      dev: true,
    })
    expect(first.stamp).toMatchObject({ user_id: user.id, place_id: place.id, xp: 20 })
    expect(first.profile).toMatchObject({ id: user.id, xp: 20 })

    setNow(T('23:45'))
    await expect(localDb.stampPlace({ ...common, position, fake: false, dev: true }))
      .rejects.toThrow('Already stamped here today')

    setNow(T('00:15', '2030-01-16'))
    const nextDay = await localDb.stampPlace({ ...common, position, fake: false, dev: false })
    expect(nextDay.profile).toMatchObject({ id: user.id, xp: 40 })
    expect(await localDb.listStamps(user.id)).toHaveLength(2)
  })

  it('filters stamps by user id', async () => {
    setNow(T('12:00'))
    const { user } = await localDb.signInGuest('Stamp User')
    await localDb.stampPlace({
      userId: user.id,
      place,
      position,
      fake: false,
      dev: false,
      xp: 5,
    })

    const otherPlace = { ...place, id: 'gardens', lat: 1.2816, lng: 103.8636 }
    await localDb.stampPlace({
      userId: 'another-user',
      place: otherPlace,
      position: { lat: otherPlace.lat, lng: otherPlace.lng, accuracy: 5 },
      fake: false,
      dev: true,
      xp: 5,
    })

    expect(await localDb.listStamps(user.id)).toHaveLength(1)
    expect(await localDb.listStamps('another-user')).toHaveLength(1)
    expect(await localDb.listStamps('missing-user')).toEqual([])
  })
})

describe('localDb passport pages', () => {
  it('merges passport page updates and preserves the user id', async () => {
    expect(await localDb.getPassportPage('guest-1')).toBeNull()

    const first = await localDb.savePassportPage('guest-1', { seen: ['merlion'], chops: 1 })
    const second = await localDb.savePassportPage('guest-1', { chops: 2, nationality: 'US' })

    expect(first).toEqual({ user_id: 'guest-1', seen: ['merlion'], chops: 1 })
    expect(second).toEqual({
      user_id: 'guest-1',
      seen: ['merlion'],
      chops: 2,
      nationality: 'US',
    })
    expect(await localDb.getPassportPage('guest-1')).toEqual(second)
  })
})

describe('localDb malformed JSON fallbacks', () => {
  it.each([
    ['session', 'zoot.session', async () => localDb.getSession(), null],
    ['profile', 'zoot.profile', async () => localDb.getProfile('guest-1'), null],
    ['trips', 'zoot.trips', async () => {
      const row = await localDb.saveTrip({ id: 'fallback-trip', title: 'Fallback' })
      return JSON.parse(localStorage.getItem('zoot.trips')).map((trip) => trip.id === row.id)
    }, [true]],
    ['missions', 'zoot.missions', async () => localDb.listMissions(), []],
    ['stamps', 'zoot.stamps', async () => localDb.listStamps('guest-1'), []],
    ['passport', 'zoot.passport', async () => localDb.getPassportPage('guest-1'), null],
  ])('catches malformed %s JSON and returns its defined fallback', async (_name, key, read, fallback) => {
    localStorage.setItem(key, '{bad')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(read()).resolves.toEqual(fallback)

    expect(error).toHaveBeenCalled()
  })
})
