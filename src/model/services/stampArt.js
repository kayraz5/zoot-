import { placeById } from './catalog.js'
import { placeStamp, areaStamp } from '../data/stampArt.js'

/**
 * Stamp art looked up by place name, for screens that only have the name (Codex, place page, mission card).
 * The pictures are named by place id (see model/data/stampArt.js), so the name is turned into an id first.
 * Returns null when there's no picture; callers fall back to their drawn chop.
 */
let byName = null
let builtFrom = null

function placeIdForName(name) {
  if (builtFrom !== placeById.value) {
    builtFrom = placeById.value
    byName = new Map([...builtFrom.values()].map((place) => [place.name, place.id]))
  }
  return byName.get(name) || null
}

export const placeStampUrl = (name) => placeStamp(placeIdForName(name))
export const areaStampUrl = (areaId) => areaStamp(areaId || '')
