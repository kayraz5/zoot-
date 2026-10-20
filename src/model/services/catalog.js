import { shallowRef } from 'vue'
import seedPlaces from '../data/places.sg.json'
import syncedPlaces from '../data/places.synced.json'
import { getDb } from './db/index.js'
import { nearestHub } from './travel.js'

/**
 * Place catalog. Supabase `places` is the source of truth when connected.
 * Offline it uses places.synced.json (seed + STB + OpenStreetMap, from `pnpm sync:places`),
 * or the curated seed if no sync has been run.
 * Inactive places are hidden from the catalog but kept in placeById so old stamps still resolve.
 */
const bundled = syncedPlaces.length ? syncedPlaces : seedPlaces

export const catalog = shallowRef([])
export const placeById = shallowRef(new Map())
setPlaces(bundled)

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
