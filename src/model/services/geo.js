import { reactive } from 'vue'

/**
 * Shared position: real GPS via watchPosition, or a fake fix the /dev panel can teleport.
 * TODO: placeholder written to unblock the build; replace with the real module if one exists.
 */
export const geo = reactive({ lat: null, lng: null, accuracy: null, source: null, fake: false })

let watchId = null

export function hasFix() {
  return geo.lat != null && geo.lng != null
}

export function startGps() {
  if (watchId != null || typeof navigator === 'undefined' || !navigator.geolocation) return
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (geo.fake) return
      geo.lat = pos.coords.latitude
      geo.lng = pos.coords.longitude
      geo.accuracy = pos.coords.accuracy
      geo.source = 'gps'
    },
    (err) => console.warn('[geo]', err.message),
    { enableHighAccuracy: true, maximumAge: 5000 }
  )
}

/** Toggle fake GPS; optionally drop the fake fix at a point. */
export function setFake(on, point) {
  geo.fake = on
  if (on) {
    if (point) teleport(point)
  } else {
    geo.lat = geo.lng = geo.accuracy = geo.source = null
    startGps()
  }
}

export function teleport({ lat, lng }) {
  geo.lat = lat
  geo.lng = lng
  geo.accuracy = 5
  geo.source = 'fake'
}
