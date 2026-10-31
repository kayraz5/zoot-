// Supabase-gated (Tier 0, anon read). Runs only in the Vitest `supabase` project, when
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set, SKIP_SUPABASE is not 1 and the
// read-only preflight succeeded. Otherwise it is skipped with a name-only reason.
// Assertions compare counts and booleans only, so a failure never prints table rows.
import { afterEach, describe, expect, inject, it, vi } from 'vitest'
import { catalog, loadCatalog, placeById } from '../model/services/catalog.js'

const gate = inject('supabaseGate') ?? { enabled: false, reason: 'Supabase-gated: gate not provided' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('catalog service against the configured Supabase project', () => {
  it('loads the public places table and keeps a usable catalog', async (ctx) => {
    ctx.skip(!gate.enabled, gate.reason)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bundled = catalog.value

    await loadCatalog()

    expect(warn.mock.calls.length, 'loadCatalog fell back to the bundled places').toBe(0)
    expect(catalog.value !== bundled, 'catalog was replaced by the table rows').toBe(true)
    expect(catalog.value.length).toBeGreaterThan(0)

    const malformed = catalog.value.filter((place) => !(
      typeof place.id === 'string'
      && typeof place.name === 'string'
      && Number.isFinite(place.lat)
      && Number.isFinite(place.lng)
      && Array.isArray(place.tags)
      && typeof place.mrt === 'string'
    )).length
    expect(malformed, 'places missing id, name, lat, lng, tags or mrt').toBe(0)

    const unindexed = catalog.value.filter((place) => !placeById.value.has(place.id)).length
    expect(unindexed, 'catalog ids missing from placeById').toBe(0)
  })
})
