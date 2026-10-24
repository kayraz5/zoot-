import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCleanSlate } from './helpers/index.js'

useCleanSlate()

let db

async function importFreshPassport({ stamps = [], page = null, listError = null } = {}) {
  vi.resetModules()
  db = {
    listStamps: vi.fn(async () => {
      if (listError) throw listError
      return stamps
    }),
    getPassportPage: vi.fn(async () => page),
    savePassportPage: vi.fn(async (userId, updates) => ({ user_id: userId, ...updates })),
  }

  vi.doMock('../model/services/db/index.js', () => ({
    getDb: vi.fn(async () => db),
  }))

  const passportModule = await import('../model/stores/passport.js')
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())

  return {
    ...passportModule,
    db,
  }
}

async function settle(store) {
  await store.whenLoaded()
  await store.save()
}

function stamp(placeId, area = 'central', index = 0) {
  return {
    id: `stamp-${placeId}-${index}`,
    place_id: placeId,
    area,
    stamped_at: `2030-01-15T10:${String(index).padStart(2, '0')}:00.000Z`,
  }
}

function areaStamps(count, area = 'central') {
  return Array.from({ length: count }, (_, index) => stamp(`${area}-${index + 1}`, area, index))
}

afterEach(() => {
  vi.doUnmock('../model/services/db/index.js')
  vi.resetModules()
})

describe('passport store initial state', () => {
  it('starts with an empty passport and no entry-rule choices', async () => {
    const { usePassportStore } = await importFreshPassport()
    const passport = usePassportStore()

    expect(passport.userId).toBeNull()
    expect(passport.stamps).toEqual([])
    expect(passport.slammed).toEqual(new Set())
    expect(passport.seen).toEqual(new Set())
    expect(passport.fresh).toEqual([])
    expect(passport.openTo).toBeNull()
    expect(passport.nationality).toBeNull()
    expect(passport.transitVisa).toBeNull()
    expect(passport.chopCount).toBe(0)
    expect(passport.pendingSlams).toEqual([])

    await settle(passport)
  })

  it('resets all passport progress when loading no user', async () => {
    const { usePassportStore } = await importFreshPassport()
    const passport = usePassportStore()
    passport.userId = 'old-user'
    passport.stamps = [stamp('old-place')]
    passport.slammed = new Set(['central'])
    passport.seen = new Set(['old-place'])
    passport.fresh = ['old-place']
    passport.nationality = 'IN'
    passport.transitVisa = true

    await passport.load(null)
    await settle(passport)

    expect(passport.userId).toBeNull()
    expect(passport.stamps).toEqual([])
    expect(passport.slammed).toEqual(new Set())
    expect(passport.seen).toEqual(new Set())
    expect(passport.fresh).toEqual([])
    expect(passport.nationality).toBeNull()
    expect(passport.transitVisa).toBeNull()
  })
})

describe('passport store loading', () => {
  it('loads stamps and passport page progress for a user', async () => {
    const stamps = areaStamps(6)
    const page = {
      slammed_areas: ['central'],
      seen_places: ['previously-seen'],
      nationality: 'IN',
      transit_visa: true,
    }
    const { usePassportStore, db } = await importFreshPassport({ stamps, page })
    const passport = usePassportStore()

    await passport.load('user-1')
    await settle(passport)

    expect(db.listStamps).toHaveBeenCalledWith('user-1')
    expect(db.getPassportPage).toHaveBeenCalledWith('user-1')
    expect(passport.userId).toBe('user-1')
    expect(passport.stamps).toEqual(stamps)
    expect(passport.stampedIds).toEqual(new Set(stamps.map(({ place_id }) => place_id)))
    expect(passport.seen).toEqual(new Set(['previously-seen', ...stamps.map(({ place_id }) => place_id)]))
    expect(passport.slammed).toEqual(new Set(['central']))
    expect(passport.choppedAreas).toEqual(['central'])
    expect(passport.nationality).toBe('IN')
    expect(passport.transitVisa).toBe(true)
  })
})

describe('passport area chops', () => {
  it('earns a chop on the sixth distinct place and ignores repeats', async () => {
    const { usePassportStore } = await importFreshPassport({
      page: { slammed_areas: [], seen_places: [] },
    })
    const passport = usePassportStore()
    await passport.load('user-1')
    await settle(passport)

    const places = areaStamps(6)
    for (const entry of places.slice(0, 5)) {
      expect(passport.addStamp(entry)).toBe(false)
    }
    expect(passport.addStamp(places[5])).toBe(true)

    expect(passport.addStamp(stamp(places[0].place_id, 'central', 20))).toBe(false)
    expect(passport.byArea.central).toHaveLength(6)
    expect(passport.choppedAreas).toEqual(['central'])
    expect(passport.fresh).toEqual(places.map(({ place_id }) => place_id))

    await settle(passport)
  })

  it('reports pending slams and consumes a slammed area', async () => {
    const stamps = areaStamps(6)
    const { usePassportStore } = await importFreshPassport({
      stamps,
      page: { slammed_areas: [], seen_places: stamps.map(({ place_id }) => place_id) },
    })
    const passport = usePassportStore()
    await passport.load('user-1')
    await settle(passport)

    expect(passport.pendingSlams).toEqual(['central'])

    passport.consumeSlam('central')
    await settle(passport)

    expect(passport.slammed).toEqual(new Set(['central']))
    expect(passport.pendingSlams).toEqual([])
  })
})

describe('passport store progress persistence', () => {
  it('marks new places as seen and saves the updated progress', async () => {
    const { usePassportStore, db } = await importFreshPassport({
      page: { slammed_areas: [], seen_places: [] },
    })
    const passport = usePassportStore()
    await passport.load('user-1')
    await settle(passport)
    db.savePassportPage.mockClear()

    passport.markSeen(['place-a', 'place-b', 'place-a'])
    await settle(passport)

    expect(passport.seen).toEqual(new Set(['place-a', 'place-b']))
    expect(db.savePassportPage).toHaveBeenCalledWith('user-1', {
      slammed_areas: [],
      seen_places: ['place-a', 'place-b'],
    })
  })

  it('clears the transit visa when nationality changes', async () => {
    const { usePassportStore, db } = await importFreshPassport({
      page: {
        slammed_areas: [],
        seen_places: [],
        nationality: 'IN',
        transit_visa: true,
      },
    })
    const passport = usePassportStore()
    await passport.load('user-1')
    await settle(passport)
    db.savePassportPage.mockClear()

    passport.setNationality('US')
    await settle(passport)

    expect(passport.nationality).toBe('US')
    expect(passport.transitVisa).toBeNull()
    expect(db.savePassportPage).toHaveBeenCalledWith('user-1', {
      slammed_areas: [],
      seen_places: [],
      nationality: 'US',
      transit_visa: null,
    })
  })

  it('saves slammed areas and seen places to passport_pages', async () => {
    const { usePassportStore, db } = await importFreshPassport({
      page: { slammed_areas: [], seen_places: [] },
    })
    const passport = usePassportStore()
    await passport.load('user-1')
    await settle(passport)
    passport.slammed.add('central')
    passport.seen.add('place-a')
    passport.nationality = 'SG'
    passport.transitVisa = false
    db.savePassportPage.mockClear()

    await passport.save()

    expect(db.savePassportPage).toHaveBeenCalledWith('user-1', {
      slammed_areas: ['central'],
      seen_places: ['place-a'],
      nationality: 'SG',
      transit_visa: false,
    })
    await settle(passport)
  })
})

describe('passport store database failures', () => {
  it('resolves a failed stamp load with reset state and logs a warning', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('stamps unavailable')
    const { usePassportStore } = await importFreshPassport({ listError: error })
    const passport = usePassportStore()

    await passport.load('user-1')
    await settle(passport)

    expect(passport.stamps).toEqual([])
    expect(passport.slammed).toEqual(new Set())
    expect(passport.seen).toEqual(new Set())
    expect(passport.fresh).toEqual([])
    expect(passport.nationality).toBeNull()
    expect(passport.transitVisa).toBeNull()
    expect(warning).toHaveBeenCalledWith('[passport] could not load:', 'stamps unavailable')
  })
})
