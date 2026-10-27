import { shallowRef } from 'vue'
import syncedPlaces from '../data/places.synced.json'
import { SUPABASE_URL, SUPABASE_ANON_KEY, HAS_SUPABASE } from './config.js'
import { nearestHub } from './travel.js'

/**
 * Place catalog. Supabase `places` is the source of truth for everyone, guests included (the table is public).
 * The bundled places.synced.json (seed + OpenStreetMap, from `pnpm sync:places`) is the first paint and the offline copy.
 * Inactive places are hidden from the catalog but kept in placeById so old stamps still resolve.
 */
export const catalog = shallowRef([])
export const placeById = shallowRef(new Map())
setPlaces(syncedPlaces)

let loaded = false

function prepare(list) {
  return list.map((p) => ({
    ...p,
    tags: p.tags || [],
    mrt: p.mrt || nearestHub(p).name
  }))
}

function setPlaces(list) {
  const all = prepare(list)
  catalog.value = all.filter((p) => p.active !== false)
  placeById.value = new Map(all.map((p) => [p.id, p]))
}

export async function loadCatalog() {
  if (loaded) return catalog.value
  loaded = true
  if (!HAS_SUPABASE) return catalog.value
  try {
    // Plain REST read with the public key, so it works without signing in
    const res = await fetch(`${SUPABASE_URL}/rest/v1/places?select=*&order=name`, {
      headers: { apikey: SUPABASE_ANON_KEY }
    })
    if (!res.ok) throw new Error(`places ${res.status}`)
    const rows = await res.json()
    if (rows?.length) setPlaces(rows)
  } catch (err) {
    console.warn('[catalog] using bundled places:', err.message)
  }
  return catalog.value
}
