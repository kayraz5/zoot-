import { reactive } from 'vue'

/**
 * Shared live position and facing.
 *
 * Position comes from the real GPS (`watchPosition`) or from a fake fix the demo
 * controls can teleport. Facing comes from the device compass and is exposed as
 * `heading` in degrees clockwise from north (0 = north, 90 = east).
 *
 * A heading of `null` means "unknown" — desktop browsers, denied permission, or a
 * device without a magnetometer. Consumers must fall back to movement direction.
 */
export const geo = reactive({
  lat: null,
  lng: null,
  accuracy: null,
  source: null,
  fake: false,
  heading: null
})

let watchId = null
let headingStarted = false
let headingDenied = false
let headingListener = null

export function hasFix() {
  return geo.lat != null && geo.lng != null
}

/** True when a compass reading is available (and not overridden by demo mode). */
export function hasHeading() {
  return geo.heading != null
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

/**
 * Start listening to the device compass.
 *
 * On iOS 13+ `DeviceOrientationEvent.requestPermission()` must be called from a
 * user gesture. The map calls this on mount (works on Android/desktop), then
 * retries from taps such as "otter view" or "recentre" when iOS needs consent.
 *
 * @returns {Promise<boolean>} true once a heading source is listening
 */
export async function startHeading() {
  if (headingStarted) return true
  if (headingDenied || typeof window === 'undefined') return false

  const OrientationEvent = window.DeviceOrientationEvent
  if (!OrientationEvent) return false

  if (typeof OrientationEvent.requestPermission === 'function') {
    try {
      const permission = await OrientationEvent.requestPermission()
      if (permission !== 'granted') {
        headingDenied = true
        return false
      }
    } catch {
      // Not called from a gesture, or the user dismissed the prompt: retry on a tap.
      return false
    }
  }

  headingListener = (event) => {
    let degrees = null

    // iOS reports a ready-made compass heading (clockwise from magnetic north).
    if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
      degrees = event.webkitCompassHeading
    } else if (
      Number.isFinite(event.alpha) &&
      (event.absolute || event.type === 'deviceorientationabsolute')
    ) {
      // `alpha` rotates counter-clockwise, so invert it for a compass bearing.
      degrees = 360 - event.alpha
    }

    if (degrees == null) return
    geo.heading = ((degrees % 360) + 360) % 360
  }

  // Android exposes a reliably north-referenced event; iOS uses the regular one.
  window.addEventListener('deviceorientationabsolute', headingListener, true)
  window.addEventListener('deviceorientation', headingListener, true)
  headingStarted = true
  return true
}

/** Stop listening to the compass (component teardown). */
export function stopHeading() {
  if (headingListener && typeof window !== 'undefined') {
    window.removeEventListener('deviceorientationabsolute', headingListener, true)
    window.removeEventListener('deviceorientation', headingListener, true)
  }
  headingListener = null
  headingStarted = false
  geo.heading = null
}
