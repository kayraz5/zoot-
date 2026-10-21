import { shallowRef } from 'vue'
import syncedPlaces from '../data/places.synced.json'
import { getDb } from './db/index.js'
import { nearestHub } from './travel.js'

/**
 * Place catalog. Supabase `places` is the source of truth when connected.
 * Guests and offline use the bundled places.synced.json (seed + OpenStreetMap, from `pnpm sync:places`).
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
  try {
    const db = await getDb()
    const rows = await db.listPlaces()
    if (rows?.length) setPlaces(rows)
  } catch (err) {
    console.warn('[catalog] using bundled places:', err.message)
  }
  return catalog.value
}
