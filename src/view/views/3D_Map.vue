<script setup>
/**
 * 3D Map — the live quest screen.
 *
 * This file owns the MapLibre instance and everything drawn on it: the route, the
 * check-in ring, stop pins, the traveller avatar, and the camera that follows them.
 * Mission *state* lives in the Pinia store; this view only reads it and turns user
 * gestures into camera/map updates.
 *
 * Read order (the script follows this list top to bottom):
 *   1. Imports
 *   2. Module constants
 *   3. UI state
 *   4. Stores & derived mission state
 *   5. Map instance & mutable handles
 *   6. Lifecycle
 *   7. Map setup & theming
 *   8. Rendering
 *   9. Camera
 *  10. Mission actions
 *  11. Demo-Walk
 *  12. Watchers
 *  13. Helpers
 *
 * Naming conventions:
 *   - `mission`     the active mission object; `missionStore` is its Pinia store.
 *   - `next`        the next leg to walk to (visit or return).
 *   - `flatMode`    top-down free-roam view (pan on, 3D traveller/pins off).
 *   - `here`        the traveller's current { lat, lng }, or null before a GPS fix.
 *   - Positions are { lat, lng }; MapLibre expects [lng, lat].
 *
 * Data shapes used across the rendering functions:
 *   - liveRoute:      { coords: [[lng, lat], …], from: {lat,lng}, to: leg }
 *   - plannedSegments [{ coords, mode: 'walk'|'mrt'|'taxi', active: false }]
 *   - orbit:          { pointerId, x, y, bearing, pitch } while a drag is active
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Imports
// ─────────────────────────────────────────────────────────────────────────────
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Map as MapLibreMap, LngLatBounds, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre resolves its worker next to its own module, which Vite never copies into
// the build. Importing it with ?url makes Vite emit it as an asset and gives us the
// real URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(maplibreWorkerUrl)

import axios from 'axios'
import destination from '@turf/destination'
import { point } from '@turf/helpers'

// 3D stop pins (WebGL custom layers) — see gl/pinPoint.js.
import { PinLayer, syncStopPins } from '../gl/pinPoint.js'
// The 3D traveller: traveller.js is the body, travellerAssets.js the outfits, and
// travellerLayer.js the MapLibre wrapper (it also exports the bearing helper).
import { TravellerLayer, bearingBetween } from '../gl/travellerLayer.js'

// Presentational next-stop card. All mission/GPS data is passed as props; button
// clicks come back as events so this view stays the single owner of map state.
import MissionInfoCard from '../components/MissionInfoCard.vue'
// Mission-derived values shared with drawing and the HUD (mission, next, here,
// check-in status, guidance, countdown…).
import { useMissionNav } from '../composables/useMissionNav.js'

import { useMissionStore } from '../../model/stores/mission.js'
import { useUiStore } from '../../model/stores/ui.js'
// Outfit + fur saved in Me → Character. The store is deliberately free of 3D
// imports, so reading it here is cheap.
import { useCharacterStore } from '../../model/stores/character.js'

import { geo, hasFix, startGps, setFake, teleport } from '../../model/services/geo.js'
import { distanceM } from '../../model/services/travel.js'
import { addQuestLayers, createPlayerMarker, setFence, setQuestColors, syncStopMarkers } from '../map/questLayers.js'
import { loadCatalog } from '../../model/services/catalog.js'
import { formatTime } from '../../model/services/hours.js'
// Street-following geometry for walk/taxi legs, with provider failover. A leg whose
// router calls are still pending (or all failing) is simply not drawn — never a
// straight line.
import { getWalkRoute, getDriveRoute } from '../../model/services/routing.js'
// Same contract for MRT legs: walk + real track geometry + walk, stitched together.
import { getMrtRoute } from '../../model/services/mrtRoute.js'

// ─────────────────────────────────────────────────────────────────────────────
// 2. Module constants
// ─────────────────────────────────────────────────────────────────────────────
const TRAVELLER_LAYER_ID = 'zt-traveller'
const ROUTE_SOURCE_ID = 'mission-route'
const ROUTE_LAYER_ID = 'mission-route-line'
// A decorative Marina Bay Sands pin, added once the style has loaded.
const MBS_DEMO_PIN = { id: 'mbs-pin', lng: 103.8607, lat: 1.2830 }

/** Pick the right route resolver for a leg's travel mode. */
const ROUTE_BY_MODE = { walk: getWalkRoute, taxi: getDriveRoute, mrt: getMrtRoute }

/** Demo-Walk keyboard controls: key → bearing offset relative to the map's north. */
const KEY_DIRECTIONS = {
  w: 0, arrowup: 0,
  s: 180, arrowdown: 180,
  a: -90, arrowleft: -90,
  d: 90, arrowright: 90
}

// Bottom navigation, inlined (not AppNav.vue) so this fullscreen view can adjust
// it without affecting the shared nav used by every other page.
const navItemsBefore = [
  { to: '/map', icon: 'bi-geo-alt-fill', label: 'Map' },
  { to: '/mission', icon: 'bi-signpost-split-fill', label: 'Mission' },
  { to: '/explore', icon: 'bi-compass-fill', label: 'Explore' }
]
const navItemsAfter = [
  { to: '/quests', icon: 'bi-people-fill', label: 'Quests' },
  { to: '/passport', icon: 'bi-journal-bookmark-fill', label: 'Passport' },
  { to: '/me', icon: 'bi-person-circle', label: 'Me' }
]

/**
 * Map colour palettes. "theme" is the stylised Zoot look; "simple" follows a
 * light, Google-Maps-like street style. Brand-tied colours are read from app.css
 * at runtime so the map can never drift from the UI's tokens.
 */
const MAP_PALETTE = {
  theme: {
    background: cssVar('--zt-black-2', '#282828'),
    water: '#2f6fb8',
    building: '#55493a',
    road: cssVar('--zt-yellow', '#ffcc00'),
    parkFill: cssVar('--zt-soft-line', '#3a3626'),
    landuseFill: '#332f26',
    landcover: {
      landcover_grass: '#4a7a33',
      landcover_ice: '#3f6363',
      landcover_sand: '#9c8324',
      landcover_wood: '#355e22'
    }
  },
  simple: {
    background: '#f2efe8',
    water: '#a8d8f0',
    building: '#e4dbc8',
    road: '#ffffff', // fallback for any road_ layer roadClasses doesn't name
    roadClasses: {
      motorway: '#f8a24d', motorwayCasing: '#e8923e',
      primary: '#fcd9a6', primaryCasing: '#f0bb7c',
      secondary: '#ffffff', secondaryCasing: '#e6e3da',
      minor: '#ffffff', minorCasing: '#e9e6de',
      path: '#ddcfb3',
      rail: '#b6b2a8'
    },
    parkFill: '#cfe8c6',
    landuseFill: '#f6eedd',
    landcover: {
      landcover_grass: '#c3e3ae',
      landcover_ice: '#eaf4f4',
      landcover_sand: '#faf1d2',
      landcover_wood: '#bfe8a8'
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. UI state (everything the template binds to)
// ─────────────────────────────────────────────────────────────────────────────
const mapContainer = ref(null)          // the <div> MapLibre renders into
const mapReady = ref(false)             // style loaded + quest layers added
const following = ref(true)             // camera tracks the traveller until a user gesture
const stamping = ref(false)             // a stamp request is in flight
const helpOpen = ref(false)             // "Need help?" replan dialog
const showMissionCard = ref(readMissionCardFlag())

const flatMode = ref(false)             // true = top-down free-roam (pan enabled, no 3D)
const mapToolsOpen = ref(false)         // right-hand map tools drawer
const mapStyleOpen = ref(false)         // map appearance dialog
const buildingsVisible = ref(true)      // 3D building extrusions on/off
const mapTheme = ref('theme')           // 'theme' | 'simple'
const colorblindMode = ref(false)       // high-contrast map palette
const showTraveller3D = ref(true)       // 3D character vs flat dot
const showStopPins3D = ref(true)        // 3D tower pins vs flat numbered dots

const demoSpeed = ref(20)               // Demo-Walk multiplier (1×, 6×, 20×)
const wasdEnabled = ref(true)           // keyboard movement during Demo-Walk
const weatherData = ref(null)           // Open-Meteo snapshot for the top-left pill

// Route geometry: the live leg's resolved street path, and the cached paths for
// the legs after it. Both are produced by refreshLiveRoute/refreshPlannedRoutes.
const liveRoute = ref(null)             // { coords, from, to }
const plannedSegments = ref([])         // [{ coords, mode, active }]

// ─────────────────────────────────────────────────────────────────────────────
// 4. Stores & derived mission state
// ─────────────────────────────────────────────────────────────────────────────
const router = useRouter()
const missionStore = useMissionStore()
const ui = useUiStore()
const character = useCharacterStore()

const {
  HOME_RADIUS_M, modeIcon,
  demo, mission, next, here, check, lateBy, liveTravel, distance, stopNumber, guidance,
  countdown, leaveBy, isTimeCritical, isTimeWarning,
  formatDistance
} = useMissionNav()

// ─────────────────────────────────────────────────────────────────────────────
// 5. Map instance & mutable handles
// ─────────────────────────────────────────────────────────────────────────────
let map = null                          // MapLibre map instance
let player = null                       // flat "you are here" DOM marker
let traveller3D = null                  // 3D character layer (null while using the dot)
let lastTravellerAt = null              // previous fix, used to work out facing
let travellerStopTimer = 0              // drops the walk cycle after the fixes stop

// Per-leg render state. Keys are derived from seq + place_id so a leg keeps the
// same identity across replans (see legKey()).
const markers = new Map()               // flat stop markers  → MapLibre Marker
const pins = new Map()                  // 3D stop towers     → PinLayer
// Resolved planned segments, kept across refreshes: a segment that resolved once
// keeps rendering (stale-while-revalidate) until a fresh geometry replaces it.
const plannedRouteCache = new Map()     // legKey → { coords, mode }

// Timers / animation.
let raf = 0
let lastFrame = 0
let noFixTimer = 0
let retryTimer = 0
let lastRouteAt = 0
const keys = new Set()                  // pressed Demo-Walk keys (w/a/s/d + arrows)
let orbit = null                        // active drag-to-orbit gesture, or null

// ─────────────────────────────────────────────────────────────────────────────
// 6. Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
onMounted(async () => {
  createMap()

  await loadCatalog()
  await missionStore.loadActive()
  if (!geo.fake) startGps()

  // GPS can be slow or denied; only nag once we know a mission cares about it.
  noFixTimer = window.setTimeout(() => {
    if (!hasFix() && mission.value) {
      ui.toast(
        "Can't find your location. Allow location access, or tap Enable Demo-Walk to try the quest from here.",
        'warning',
        6000
      )
    }
  }, 8000)

  window.addEventListener('keydown', onDemoKeyDown)
  window.addEventListener('keyup', onDemoKeyUp)
  raf = requestAnimationFrame(demoWalkLoop)

  // Weather is decorative; a failure must never block the map.
  ui.loadWeather(1.2897, 103.8501)
  try {
    const { data } = await axios.get(
      'https://api.open-meteo.com/v1/forecast?latitude=1.2897&longitude=103.8501&current=temperature_2m,rain,uv_index'
    )
    weatherData.value = data
  } catch (err) {
    console.error('[3D_Map] weather fetch failed', err)
  }
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  clearTimeout(noFixTimer)
  clearTimeout(retryTimer)
  clearTimeout(travellerStopTimer)
  window.removeEventListener('keydown', onDemoKeyDown)
  window.removeEventListener('keyup', onDemoKeyUp)
  detachOrbitListeners()
  markers.clear()
  pins.clear()
  map?.remove()
  map = null
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Map setup & theming
// ─────────────────────────────────────────────────────────────────────────────

/** Create the MapLibre instance, wire its events, and attach the orbit gesture. */
function createMap() {
  map = new MapLibreMap({
    container: mapContainer.value,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [103.8198, 1.3521], // Singapore
    zoom: 16.5,
    pitch: 56,
    bearing: -18,
    maxPitch: 72,
    minZoom: 10,
    // The camera is locked to the traveller: panning/rotating are intentionally
    // off and replaced by the custom orbit (3D) and free-roam (flat) modes below.
    dragPan: false,
    dragRotate: false,
    keyboard: false,
    boxZoom: false,
    attributionControl: { compact: true },
    canvasContextAttributes: { antialias: true },
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
  })

  // Pinch still zooms; it just no longer doubles as a two-finger rotate.
  map.touchZoomRotate.disableRotation()
  // Scroll/trackpad zoom centres on the screen, not the cursor, so it can't drift
  // the view off the traveller.
  map.scrollZoom.enable({ around: 'center' })
  // The drag-to-orbit handler is pointer-event driven. MapLibre's CSS would give
  // this canvas `touch-action: pan-x pan-y` (dragPan is off, so its `none` rule
  // never applies), which lets the browser claim a horizontal touch drag and fire
  // `pointercancel` mid-gesture. `none` keeps the whole drag as pointer events;
  // MapLibre's pinch-zoom uses touch events, so it is unaffected.
  map.getCanvas().style.touchAction = 'none'

  map.on('load', applyMapColors)
  map.on('load', onMapLoad)
  map.on('load', () => centerOnMe(false))
  map.on('load', () => map.addLayer(new PinLayer(MBS_DEMO_PIN)))
  map.on('load', syncPlayerAvatar)

  map.on('movestart', onMapMoveStart)
  map.on('moveend', onMapMoveEnd)

  attachOrbitListeners()
}

/** First style load: add quest layers and start rendering. */
function onMapLoad() {
  addQuestLayers(map)
  player = createPlayerMarker()
  mapReady.value = true
}

/**
 * A real user gesture (pointer/wheel/touch) pauses follow; our own flyTo/easeTo/
 * jumpTo calls carry no `originalEvent`, so they never fight the camera.
 */
function onMapMoveStart(event) {
  if (event.originalEvent && !flatMode.value) following.value = false
}

/** When a real gesture ends, settle back onto the traveller (unless free-roaming). */
function onMapMoveEnd(event) {
  if (!event.originalEvent || flatMode.value) return
  following.value = true
  if (here.value) map.easeTo({ center: [here.value.lng, here.value.lat], duration: 500 })
}

function attachOrbitListeners() {
  const canvas = map.getCanvas()
  canvas.addEventListener('pointerdown', onOrbitPointerDown)
  canvas.addEventListener('pointermove', onOrbitPointerMove)
  canvas.addEventListener('pointerup', onOrbitPointerUp)
  canvas.addEventListener('pointercancel', onOrbitPointerUp)
}

function detachOrbitListeners() {
  if (!map) return
  const canvas = map.getCanvas()
  canvas.removeEventListener('pointerdown', onOrbitPointerDown)
  canvas.removeEventListener('pointermove', onOrbitPointerMove)
  canvas.removeEventListener('pointerup', onOrbitPointerUp)
  canvas.removeEventListener('pointercancel', onOrbitPointerUp)
}

/**
 * Read a CSS custom property from :root, with a fallback. Lets the map reuse the
 * app's brand tokens instead of carrying a second, drift-prone copy of the hexes.
 */
function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Pick a road colour by layer class. "simple" tiers roads like Google Maps
 * (orange motorways → white local streets); casing layers get the darker edge.
 */
function roadColorFor(layerId, palette) {
  const classes = palette.roadClasses
  if (!classes) return palette.road

  const isCasing = layerId.endsWith('_casing') || layerId.endsWith('_hatching')
  if (layerId.includes('motorway')) return isCasing ? classes.motorwayCasing : classes.motorway
  if (layerId.includes('trunk_primary')) return isCasing ? classes.primaryCasing : classes.primary
  if (layerId.includes('secondary_tertiary')) return isCasing ? classes.secondaryCasing : classes.secondary
  if (layerId.includes('rail')) return classes.rail
  if (layerId.includes('path_pedestrian')) return classes.path
  // Minor streets, ramps/links and service roads all read as plain local streets.
  return isCasing ? classes.minorCasing : classes.minor
}

/** Apply the selected palette to background, water, buildings, roads and land cover. */
function applyMapColors() {
  if (!map || !map.isStyleLoaded()) return

  const palette = mapTheme.value === 'theme' ? MAP_PALETTE.theme : MAP_PALETTE.simple

  map.setPaintProperty('background', 'background-color', palette.background)
  map.setPaintProperty('water', 'fill-color', palette.water)
  map.setPaintProperty('building', 'fill-color', palette.building)
  map.setPaintProperty('building-3d', 'fill-extrusion-color', palette.building)

  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('road_') && layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-color', roadColorFor(layer.id, palette))
    }
  }

  for (const layer of map.getStyle().layers) {
    if (palette.landcover[layer.id]) {
      map.setPaintProperty(layer.id, 'fill-color', palette.landcover[layer.id])
    } else if (layer.id === 'park' && layer.type === 'fill') {
      map.setPaintProperty(layer.id, 'fill-color', palette.parkFill)
    } else if (layer.id.startsWith('landuse_') && layer.type === 'fill') {
      map.setPaintProperty(layer.id, 'fill-color', palette.landuseFill)
    }
  }
}

/**
 * Okabe–Ito high-contrast palette for colourblind users. Turning it off restores
 * the normal palette for the current theme.
 */
function setColorblindMode(enabled) {
  colorblindMode.value = enabled
  if (!map || !map.isStyleLoaded()) return

  if (!enabled) {
    applyMapColors()
    return
  }

  map.setPaintProperty('building', 'fill-color', '#E69F00')            // orange
  map.setPaintProperty('building-3d', 'fill-extrusion-color', '#E69F00')
  map.setPaintProperty('water', 'fill-color', '#0072B2')               // blue

  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('road_') && layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-color', '#F0E442')          // yellow
    }
  }

  const safeLandcover = {
    landcover_grass: '#009E73', // bluish-green
    landcover_wood: '#009E73',
    landcover_sand: '#E69F00',
    landcover_ice: '#56B4E9'
  }
  for (const layer of map.getStyle().layers) {
    if (safeLandcover[layer.id]) {
      map.setPaintProperty(layer.id, 'fill-color', safeLandcover[layer.id])
    }
  }
}

/** Show or hide the 2D/3D building layers. */
function setBuildingsVisible(show) {
  buildingsVisible.value = show
  const visibility = show ? 'visible' : 'none'
  for (const layerId of ['building', 'building-3d']) {
    if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  }
}

/**
 * Switch between the guided 3D view and the flat free-roam view.
 *
 * Flat: panning on, follow off, 2D dots instead of towers/traveller — you can
 * look around the whole island.
 * 3D: panning locked, follow resumed, traveller and tower pins back.
 */
function setFlatMode(isFlat) {
  flatMode.value = isFlat

  if (isFlat) {
    following.value = false
    map.dragPan.enable()
    animateToFlat()
    showTraveller3D.value = false
    showStopPins3D.value = false
    return
  }

  map.dragPan.disable()
  following.value = true
  if (!geo.fake) startGps()
  if (here.value) {
    map.flyTo({ center: [here.value.lng, here.value.lat], zoom: 18, pitch: 56, bearing: -18, duration: 1200 })
  } else {
    animateTo3D()
  }
  showTraveller3D.value = true
  showStopPins3D.value = true
}

function toggleFlatMode() {
  setFlatMode(!flatMode.value)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Rendering
// ─────────────────────────────────────────────────────────────────────────────

/** Redraw everything that depends on the mission: avatars, pins, route, fence, zoom. */
function drawMission() {
  if (!mapReady.value) return
  syncPlayerAvatar()
  syncStopVisuals()
  drawRoute()
  drawFence()
  updateMinZoomForStops()
}

/**
 * Panning is locked, so zooming out is the only way to see a distant stop. Cap the
 * minimum zoom at whatever fits every stop (plus the traveller) on screen.
 */
function updateMinZoomForStops() {
  if (!map) return

  const points = missionStore.legs.map((leg) => [leg.lng, leg.lat])
  if (here.value) points.push([here.value.lng, here.value.lat])
  if (points.length < 2) {
    map.setMinZoom(10)
    return
  }

  const bounds = points.reduce(
    (box, coordinate) => box.extend(coordinate),
    new LngLatBounds(points[0], points[0])
  )
  const camera = map.cameraForBounds(bounds, { padding: 60 })
  map.setMinZoom(camera ? Math.min(camera.zoom, 17) : 10)
}

/** Show exactly one stop representation at a time: 3D towers or flat dots. */
function syncStopVisuals() {
  if (!mapReady.value) return

  if (showStopPins3D.value) {
    // An empty leg list tears the other representation down.
    syncStopMarkers(map, markers, [], next.value, flyTo)
    syncStopPins(map, pins, missionStore.legs)
  } else {
    syncStopPins(map, pins, [])
    syncStopMarkers(map, markers, missionStore.legs, next.value, flyTo)
  }
}

/** Draw the check-in ring around the next stop (wider at home). */
function drawFence() {
  if (!map) return
  const target = next.value
  const radius = target?.kind === 'return' ? HOME_RADIUS_M : (check.value?.radius ?? 80)
  setFence(map, target, radius, !!check.value?.ok)
}

/**
 * Render the route we actually know: the live leg once its real street geometry
 * has resolved, plus every cached planned segment. Anything unresolved is simply
 * not drawn — never a straight-line fallback.
 */
function drawRoute() {
  if (!mapReady.value) return

  const segments = []
  const target = next.value
  if (target) {
    const origin = here.value || previousPoint(target)
    const live = liveRoute.value
    if (live && live.to === target) {
      segments.push([[origin.lng, origin.lat], ...live.coords])
    }
  }
  for (const segment of plannedSegments.value) segments.push(segment.coords)

  const data = {
    type: 'FeatureCollection',
    features: segments.map((coordinates) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {}
    }))
  }

  const source = map.getSource(ROUTE_SOURCE_ID)
  if (source) {
    source.setData(data)
    return
  }

  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data })
  map.addLayer({
    id: ROUTE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#ff1dce',
      'line-width': 5,
      'line-opacity': 0.9
    }
  })
}

/** Where the traveller was before `leg`: the previous leg, or the trip origin. */
function previousPoint(leg) {
  const legs = missionStore.legs
  const index = legs.indexOf(leg)
  return index > 0 ? legs[index - 1] : mission.value.origin
}

/** Stable identity for an adjacent leg pair, independent of array position. */
function legKey(a, b) {
  return `${a.seq}:${a.place_id || 'home'}>${b.seq}:${b.place_id || 'home'}`
}

/** Rebuild `plannedSegments` from whatever is already in the cache. */
function syncPlannedSegments(pendingLegs) {
  plannedSegments.value = pendingLegs
    .slice(1)
    .map((leg, index) => {
      const segment = plannedRouteCache.get(legKey(pendingLegs[index], leg))
      return segment && { coords: segment.coords, mode: segment.mode, active: false }
    })
    .filter(Boolean)

  drawRoute()
}

/**
 * Fetch street geometry for every later pending leg, then redraw. The cache makes
 * this stale-while-revalidate: existing geometry renders immediately, fresh
 * results replace it as they arrive, and a failed fetch never erases a good route.
 */
async function refreshPlannedRoutes() {
  const pendingLegs = missionStore.legs.filter((leg) => leg.status === 'pending')

  // Drop cache entries for pairs that no longer exist (replans, skips, reorders).
  const activeKeys = new Set(pendingLegs.slice(1).map((leg, index) => legKey(pendingLegs[index], leg)))
  for (const key of plannedRouteCache.keys()) {
    if (!activeKeys.has(key)) plannedRouteCache.delete(key)
  }

  syncPlannedSegments(pendingLegs)

  await Promise.all(
    pendingLegs.slice(1).map(async (leg, index) => {
      const previous = pendingLegs[index]
      const resolveRoute = ROUTE_BY_MODE[leg.travel_mode]
      if (!resolveRoute) return

      const route = await resolveRoute(previous, leg)
      if (!route) return // keep the cached geometry, if any

      plannedRouteCache.set(legKey(previous, leg), { coords: route.coords, mode: leg.travel_mode })
      syncPlannedSegments(pendingLegs)
    })
  )
}

/**
 * Refresh the geometry for the leg currently being walked. Throttled while moving
 * (Demo-Walk at 20× would otherwise hammer the routers) and skipped when the
 * traveller has barely moved or the target has not changed.
 */
async function refreshLiveRoute(force = false) {
  clearTimeout(retryTimer)

  const target = next.value
  const travelMode = liveTravel.value?.mode
  const resolveRoute = ROUTE_BY_MODE[travelMode]

  // Nothing to draw yet: no target, no fix, or no resolver for this mode.
  if (!target || !here.value || !resolveRoute) return drawRoute()

  const current = liveRoute.value
  const movedMeters = current ? distanceM(current.from, here.value) : Infinity
  if (!force && current?.to === target && movedMeters < 25) return drawRoute()

  const waitMs = 3000 - (Date.now() - lastRouteAt)
  if (!force && waitMs > 0) {
    retryTimer = window.setTimeout(() => refreshLiveRoute(), waitMs)
    return drawRoute()
  }
  lastRouteAt = Date.now()

  const from = { ...here.value }
  const route = await resolveRoute(from, target)
  // Ignore late responses for a target that is no longer next.
  if (route && next.value === target) {
    liveRoute.value = { coords: route.coords, from, to: target }
  }
  drawRoute()
}

/**
 * Decide which avatar is visible: the 3D traveller or the flat pulsing dot. Never
 * both. Neither appears before a GPS fix — that would claim a position we do not
 * actually know.
 */
function syncPlayerAvatar() {
  if (!mapReady.value) return

  const position = here.value

  if (showTraveller3D.value) {
    player?.remove() // safe every call; no-op if it was never added
    if (!position) return

    if (!traveller3D) {
      traveller3D = new TravellerLayer({
        id: TRAVELLER_LAYER_ID,
        lng: position.lng,
        lat: position.lat,
        outfit: character.outfit,
        fur: character.fur,
        hat: character.hat,
        eyewear: character.eyewear
      })
      map.addLayer(traveller3D)
    }

    moveTraveller(position)
    return
  }

  // Switched to the flat dot: tear the character down (onRemove frees geometry).
  if (traveller3D) {
    if (map.getLayer(TRAVELLER_LAYER_ID)) map.removeLayer(TRAVELLER_LAYER_ID)
    traveller3D = null
    lastTravellerAt = null
    clearTimeout(travellerStopTimer)
  }
  if (position) player.setLngLat([position.lng, position.lat]).addTo(map)
}

/**
 * Keep the 3D character on the latest fix, facing the direction of travel and
 * playing the walk cycle while he is actually moving.
 */
function moveTraveller(position) {
  if (!traveller3D) return
  traveller3D.setLngLat(position.lng, position.lat)

  // Only turn on a real step: GPS jitter would otherwise spin him on the spot.
  if (lastTravellerAt && distanceM(lastTravellerAt, position) > 3) {
    traveller3D.setBearing(bearingBetween(lastTravellerAt, position))
    traveller3D.setMoving(true)

    // Fixes stop arriving when you stop walking, so re-arm an idle timer instead.
    clearTimeout(travellerStopTimer)
    travellerStopTimer = window.setTimeout(() => traveller3D?.setMoving(false), 2500)
    lastTravellerAt = { ...position }
  } else if (!lastTravellerAt) {
    lastTravellerAt = { ...position }
  }
}

/**
 * Drag-to-orbit for the guided 3D view: horizontal drag spins the bearing, vertical
 * drag tilts the pitch, both pivoting on the traveller so the world rotates around
 * them instead of sliding underneath.
 *
 * Only the primary pointer drives this. A second finger means pinch-zoom, so the
 * orbit steps aside and MapLibre's touchZoomRotate owns the gesture.
 */
function onOrbitPointerDown(event) {
  if (!map || flatMode.value) return
  if (!event.isPrimary) {
    orbit = null
    return
  }

  event.preventDefault()
  map.getCanvas().setPointerCapture?.(event.pointerId)
  orbit = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    bearing: map.getBearing(),
    pitch: map.getPitch()
  }
  // Stop the GPS follow watcher from recentring mid-gesture and fighting the orbit.
  following.value = false
}

function onOrbitPointerMove(event) {
  if (!orbit || !map || event.pointerId !== orbit.pointerId) return

  const dx = event.clientX - orbit.x
  const dy = event.clientY - orbit.y
  const around = here.value ? [here.value.lng, here.value.lat] : undefined

  map.jumpTo({
    bearing: orbit.bearing + dx * 0.7,
    pitch: Math.min(map.getMaxPitch(), Math.max(0, orbit.pitch - dy * 0.35)),
    around
  })
}

function onOrbitPointerUp(event) {
  if (!orbit || event.pointerId !== orbit.pointerId) return

  map?.getCanvas().releasePointerCapture?.(event.pointerId)
  orbit = null
  following.value = true
  // Pivoting on a non-centre `around` nudges `center`; settle back onto the traveller.
  if (here.value && map) map.easeTo({ center: [here.value.lng, here.value.lat], duration: 300 })
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Camera
// ─────────────────────────────────────────────────────────────────────────────

/** Fly to a stop, and stop following until the user recentres. */
function flyTo(place, zoom = 17) {
  map?.flyTo({ center: [place.lng, place.lat], zoom, duration: 1200 })
  following.value = false
}

/** Recentre on the traveller (or explain why we cannot). */
function centerOnMe(notifyOnFail = true) {
  following.value = true
  if (!geo.fake) startGps()

  if (here.value) {
    map.flyTo({ center: [here.value.lng, here.value.lat], zoom: 18, duration: 1500 })
  } else if (notifyOnFail) {
    ui.toast('Waiting for GPS… Allow location access, or turn on Demo-Walk.', 'dark')
  }
}

function zoomIn() {
  map.zoomIn({ duration: 1500 })
}

function zoomOut() {
  map.zoomTo(12, { duration: 1500 })
}

function animateToFlat() {
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
}

function animateTo3D() {
  map.easeTo({ pitch: 56, bearing: -18, duration: 600 })
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Mission actions
// ─────────────────────────────────────────────────────────────────────────────

/** Stamp the next stop, or check in at home. */
async function stampNextStop() {
  const target = next.value
  if (!target || stamping.value) return
  if (!check.value?.ok) return ui.toast(check.value?.message || 'Not in range yet.', 'warning', 3500)

  stamping.value = true
  try {
    if (target.kind === 'return') await missionStore.completeReturn()
    else await missionStore.stamp(target)
    liveRoute.value = null
  } catch (err) {
    ui.toast(err.message, 'warning', 4500)
  } finally {
    stamping.value = false
  }
}

/** Rewrite the future legs ("I'm behind", "less walking", "swap", "rain"). */
async function replan(mode) {
  helpOpen.value = false
  await missionStore.replan(mode)
}

/** Skip the next visit (return legs cannot be skipped). */
async function skipNextStop() {
  helpOpen.value = false
  if (next.value?.kind !== 'visit') return
  await missionStore.skip(next.value)
  ui.toast('Stop skipped. On to the next one.', 'dark')
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Demo-Walk (fake GPS you move with WASD / taps)
// ─────────────────────────────────────────────────────────────────────────────

/** Initial bearing from `a` to `b`, in degrees clockwise from north. */
function bearingDegrees(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** A point `meters` from `origin` along `bearing` (degrees). */
function pointAtOffset(origin, bearing, meters) {
  const [lng, lat] = destination(point([origin.lng, origin.lat]), meters / 1000, bearing, {
    units: 'kilometers'
  }).geometry.coordinates
  return { lat, lng }
}

/** A spot `meters` short of the next stop, on the line from the previous one. */
function pointNearNextStop(meters) {
  const target = next.value
  if (!target) return mission.value?.origin || null
  const previous = previousPoint(target)
  return pointAtOffset(target, bearingDegrees(target, previous), meters)
}

/** Toggle Demo-Walk (fake GPS) on/off. */
function toggleDemoWalk() {
  if (geo.fake) {
    setFake(false)
    ui.toast('Using real GPS.', 'dark')
    return
  }

  setFake(true, here.value || pointNearNextStop(200) || undefined)
  following.value = true
  ui.toast('Demo-Walk on: use WASD / arrow keys, or tap the map to move.', 'dark', 4000)
}

/** Teleport a short distance before the next stop (demo shortcut). */
function jumpNearNextStop(meters) {
  const place = pointNearNextStop(meters)
  if (!place) return
  if (!geo.fake) setFake(true)
  teleport(place)
  following.value = true
}

function onDemoKeyDown(event) {
  if (!geo.fake || !wasdEnabled.value || event.target.closest?.('input, textarea, select')) return
  const key = event.key.toLowerCase()
  if (key in KEY_DIRECTIONS) {
    keys.add(key)
    event.preventDefault()
  }
}

function onDemoKeyUp(event) {
  keys.delete(event.key.toLowerCase())
}

/** Frame loop: move the fake GPS while WASD keys are held, then request the next frame. */
function demoWalkLoop(timestamp) {
  const deltaMs = Math.min(100, timestamp - (lastFrame || timestamp))
  lastFrame = timestamp

  if (keys.size && geo.fake && hasFix() && map) {
    let directionX = 0
    let directionY = 0
    for (const key of keys) {
      const angle = ((KEY_DIRECTIONS[key] + map.getBearing()) * Math.PI) / 180
      directionX += Math.sin(angle)
      directionY += Math.cos(angle)
    }

    if (directionX || directionY) {
      const metersPerSecond = 1.4 * demoSpeed.value // walking pace × demo multiplier
      const bearing = (Math.atan2(directionX, directionY) * 180) / Math.PI
      teleport(pointAtOffset(here.value, bearing, (metersPerSecond * deltaMs) / 1000))
      following.value = true
    }
  }

  raf = requestAnimationFrame(demoWalkLoop)
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Watchers
// ─────────────────────────────────────────────────────────────────────────────

// Remember the card's open/closed state across visits to other pages.
watch(showMissionCard, (open) => writeMissionCardFlag(open))

// A new GPS fix: move the avatar and keep the camera on it unless the user is looking around.
watch(() => [here.value?.lat, here.value?.lng], onHereChanged)

// Stamps, skips, replans and reorders change the legs: redraw everything.
watch(
  () => [
    mapReady.value,
    mission.value?.id,
    missionStore.legs.map((leg) => `${leg.seq}${leg.status}${leg.place_id}`).join()
  ],
  onMissionLegsChanged
)

watch(check, drawFence)
watch(showTraveller3D, syncPlayerAvatar)
watch(showStopPins3D, syncStopVisuals)

// Saving a look in Me → Character recolours the existing character in place.
watch(
  () => [character.outfit, character.fur, character.hat, character.eyewear],
  syncTravellerAppearance
)

watch(mapTheme, () => {
  applyMapColors()
  if (map) setQuestColors(map, mapTheme.value === 'theme')
})

function onHereChanged() {
  if (!mapReady.value || !here.value) return

  syncPlayerAvatar()

  if (following.value) {
    // Following always means street level, even if the user had zoomed out.
    const zoom = map.getZoom() < 15.5 ? 16.8 : undefined
    if (geo.fake && !zoom) map.jumpTo({ center: [here.value.lng, here.value.lat] })
    else map.easeTo({ center: [here.value.lng, here.value.lat], zoom, duration: zoom ? 900 : 600 })
  }

  drawFence()
  refreshLiveRoute()
}

function onMissionLegsChanged() {
  drawMission()
  refreshPlannedRoutes()
  refreshLiveRoute(true)
}

function syncTravellerAppearance() {
  if (!traveller3D) return
  // setOutfit rebuilds every slot including head/face, so hats and glasses go on after.
  traveller3D.setOutfit(character.outfit)
  traveller3D.setFur(character.fur)
  traveller3D.setHat(character.hat)
  traveller3D.setEyewear(character.eyewear)
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. Helpers
// ─────────────────────────────────────────────────────────────────────────────

// The next-stop card remembers whether it was left open. '1' means open; any
// other value (including a first visit) means closed. localStorage can be
// unavailable, so both operations fail safe to "closed".
function readMissionCardFlag() {
  try {
    return localStorage.getItem('zoot.mapMissionCard') === '1'
  } catch {
    return false
  }
}

function writeMissionCardFlag(open) {
  try {
    localStorage.setItem('zoot.mapMissionCard', open ? '1' : '0')
  } catch {
    // Ignore: the preference just will not persist.
  }
}
</script>
<template>
  <!-- MapLibre renders into this element; every overlay below is plain DOM on top. -->
  <div ref="mapContainer" class="quest-map"></div>

  <!-- ── Top-left status pills ─────────────────────────────────────────── -->
  <div id="top-left" class="badge rounded-pill text-bg-warning">
    <img id="img-pill" src="/brand/zoot-badge-192.png" alt="" width="25" height="25">
    Singapore
  </div>

  <div id="top-left2" class="badge rounded-pill text-bg-warning">
    <span class="bi bi-sun-fill">{{ weatherData?.current?.temperature_2m }}C</span>
    <span class="bi bi-cloud-rain-heavy-fill">&nbsp;{{ weatherData?.current?.rain }}</span>
  </div>

  <button id="top-left3" class="btn btn-warning rounded-pill" @click="toggleDemoWalk">
    {{ demo ? 'Use real GPS' : 'Enable Demo-Walk' }}
  </button>

  <!-- ── Right stack: countdown + map tools ────────────────────────────── -->
  <div id="right-stack">
    <!-- Two explicit class flags instead of one derived string, so the red/amber
         thresholds stay visible here and in useMissionNav. -->
    <div
      id="top-right"
      class="badge rounded-4 text-bg-warning"
      :class="{ red: isTimeCritical, amber: isTimeWarning }"
      role="timer"
    >
      <span class="bi-airplane-fill"> &nbsp; Time to Travel</span>
      <br>
      <div class="time_left_from_trip mono">{{ countdown || '--:--:--' }}</div>
      <div class="time_back_from_trip">
        {{ leaveBy ? `Head back by ${formatTime(leaveBy)}` : mission ? 'Quest complete' : 'No active quest' }}
      </div>
    </div>

    <div id="MoreInfo" class="map-btn" @click="mapToolsOpen = !mapToolsOpen">
      <i class="bi bi-list"></i>
    </div>

    <div class="map-tools" :class="{ open: mapToolsOpen }">
      <div id="zoom" class="map-btn" @click="zoomIn">
        <i class="bi bi-zoom-in"></i>
      </div>

      <div id="outlook" class="map-btn" @click="zoomOut">
        <i class="bi bi-arrows-fullscreen"></i>
      </div>

      <div id="RealGps" class="map-btn" @click="centerOnMe()">
        <i class="bi bi-crosshair"></i>
      </div>

      <!-- Toggles between the guided 3D view and flat free-roam. -->
      <div id="TopView" class="map-btn" @click="toggleFlatMode()">
        <i class="bi-map"></i>
      </div>
    </div>
  </div>

  <!-- ── Next-stop card (the "center console") ─────────────────────────── -->
  <!-- Purely presentational: mission/GPS values come in as props and every button
       emits an event, keeping map + navigation state owned by this view. -->
  <Transition name="mission-pop">
    <MissionInfoCard
      v-if="showMissionCard"
      :mission="mission"
      :next="next"
      :stop-number="stopNumber"
      :live-travel="liveTravel"
      :distance="distance"
      :late-by="lateBy"
      :guidance="guidance"
      :check="check"
      :stamping="stamping"
      :stamped-count="missionStore.stampedCount"
      :total-visits="missionStore.visitLegs.length"
      :mode-icon="modeIcon"
      :format-distance="formatDistance"
      @plan="router.push('/plan')"
      @open-passport="router.push('/passport')"
      @stamp="stampNextStop"
      @change-map-style="mapStyleOpen = !mapStyleOpen"
      @need-help="helpOpen = true"
      @close="showMissionCard = false"
    />
  </Transition>

  <!-- ── Demo-Walk controls (fake GPS, dev/demo only) ──────────────────── -->
  <div v-if="demo" id="demo-controls" class="rounded-4">
    <div class="demo-row">
      <span class="demo-label">Speed</span>
      <button class="btn rounded-pill btn-sm" :class="demoSpeed === 1 ? 'btn-warning' : 'btn-outline-warning'" @click="demoSpeed = 1">1x</button>
      <button class="btn rounded-pill btn-sm" :class="demoSpeed === 6 ? 'btn-warning' : 'btn-outline-warning'" @click="demoSpeed = 6">6x</button>
      <button class="btn rounded-pill btn-sm" :class="demoSpeed === 20 ? 'btn-warning' : 'btn-outline-warning'" @click="demoSpeed = 20">20x</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">WASD movement</span>
      <button class="btn rounded-pill btn-sm" :class="wasdEnabled === true ? 'btn-warning' : 'btn-outline-warning'" @click="wasdEnabled = true">Yes</button>
      <button class="btn rounded-pill btn-sm" :class="wasdEnabled === false ? 'btn-warning' : 'btn-outline-warning'" @click="wasdEnabled = false">No</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">CheckPoint</span>
      <button class="btn rounded-pill btn-sm btn-outline-warning" :disabled="!next" @click="jumpNearNextStop(200)">Near</button>
      <button class="btn rounded-pill btn-sm btn-outline-warning" :disabled="!next" @click="jumpNearNextStop(25)">At stop</button>
    </div>
    <div class="demo-hint">Tap the map to walk there.</div>
  </div>

  <!-- ── "Need help?" replan dialog ────────────────────────────────────── -->
  <template v-if="helpOpen">
    <div class="map-backdrop" @click="helpOpen = false"></div>
    <div id="HelpPop" class="rounded-4" role="dialog" aria-label="Need help?">
      <div class="demo-label mb-2">Change the plan</div>
      <p class="help-note">Stamped stops stay. Only the stops ahead get rewritten from where you are now.</p>
      <button class="btn btn-warning btn-sm w-100 mb-2" :disabled="missionStore.status === 'planning'" @click="replan('behind')"><i class="bi bi-hourglass-split"></i> I'm behind schedule</button>
      <button class="btn btn-warning btn-sm w-100 mb-2" :disabled="missionStore.status === 'planning'" @click="replan('less-walking')"><i class="bi bi-person-walking"></i> Less walking</button>
      <button class="btn btn-warning btn-sm w-100 mb-2" :disabled="missionStore.status === 'planning' || next?.kind !== 'visit'" @click="replan('swap')"><i class="bi bi-shuffle"></i> Swap this stop</button>
      <button class="btn btn-warning btn-sm w-100 mb-2" :disabled="missionStore.status === 'planning'" @click="replan('rain')"><i class="bi bi-cloud-rain-heavy-fill"></i> It's raining</button>
      <button class="btn btn-outline-warning btn-sm w-100 mb-2" :disabled="next?.kind !== 'visit'" @click="skipNextStop"><i class="bi bi-skip-forward-fill"></i> Skip this stop</button>
      <button class="btn btn-outline-warning btn-sm w-100" @click="router.push(mission ? `/mission/${mission.id}` : '/plan')"><i class="bi bi-list-ol"></i> See full itinerary</button>
      <div v-if="missionStore.status === 'planning'" class="help-note mt-2">{{ missionStore.statusText || 'Replanning…' }}</div>
    </div>
  </template>

  <!-- ── Map appearance dialog ─────────────────────────────────────────── -->
  <div v-if="mapStyleOpen" class="map-backdrop" @click="mapStyleOpen = false"></div>

  <div id="MapPop" class="rounded-4" v-if="mapStyleOpen">
    <div class="demo-row">
      <span class="demo-label">3D Mode</span>
      <button class="btn rounded-pill btn-sm" :class="buildingsVisible === true ? 'btn-warning' : 'btn-outline-warning'" @click="setBuildingsVisible(true)">On</button>
      <button class="btn rounded-pill btn-sm" :class="buildingsVisible === false ? 'btn-warning' : 'btn-outline-warning'" @click="setBuildingsVisible(false)">Off</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">Color Theme</span>
      <button class="btn rounded-pill btn-sm" :class="mapTheme === 'theme' ? 'btn-warning' : 'btn-outline-warning'" @click="mapTheme = 'theme'">Zoot</button>
      <button class="btn rounded-pill btn-sm" :class="mapTheme === 'simple' ? 'btn-warning' : 'btn-outline-warning'" @click="mapTheme = 'simple'">Simple</button>
    </div>
    <!-- Swaps the "you are here" avatar between the 3D character and the flat dot. -->
    <div class="demo-row">
      <span class="demo-label">3D Traveller</span>
      <button class="btn rounded-pill btn-sm" :class="showTraveller3D === true ? 'btn-warning' : 'btn-outline-warning'" @click="showTraveller3D = true">On</button>
      <button class="btn rounded-pill btn-sm" :class="showTraveller3D === false ? 'btn-warning' : 'btn-outline-warning'" @click="showTraveller3D = false">Off</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">Colorblind Mode</span>
      <button class="btn rounded-pill btn-sm" :class="colorblindMode === true ? 'btn-warning' : 'btn-outline-warning'" @click="setColorblindMode(true)">On</button>
      <button class="btn rounded-pill btn-sm" :class="colorblindMode === false ? 'btn-warning' : 'btn-outline-warning'" @click="setColorblindMode(false)">Off</button>
    </div>
  </div>

  <!-- ── Floating button that reopens the next-stop card ───────────────── -->
  <!-- Shares the showMissionCard flag with the card itself, so only one of the two
       is ever on screen and the transition reads as one motion. -->
  <Transition name="fab-pop">
    <button
      v-if="!showMissionCard"
      type="button"
      class="map-nav-fab"
      aria-label="Show next-stop card"
      @click="showMissionCard = true"
    >
      <i class="bi bi-flag-fill" aria-hidden="true"></i>
    </button>
  </Transition>

  <!-- ── Bottom navigation (own copy for this fullscreen view) ─────────── -->
  <nav class="map-nav zt-glass" aria-label="Main">
    <RouterLink v-for="item in navItemsBefore" :key="item.to" :to="item.to">
      <i class="bi" :class="item.icon" aria-hidden="true"></i>
      <span>{{ item.label }}</span>
    </RouterLink>
    <RouterLink v-for="item in navItemsAfter" :key="item.to" :to="item.to">
      <i class="bi" :class="item.icon" aria-hidden="true"></i>
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.quest-map {
	position: absolute;
	inset: 0;
	/* Without an explicit z-index here, this element doesn't form its own stacking
	   context, so z-index values set on things MapLibre draws inside it (e.g.
	   .zt-stop-marker.next's z-index: 2) leak out and get compared directly against
	   UI chrome like #CenterInfo (z-index: 1) — letting a marker that happens to
	   project under the card paint on top of it. z-index: 0 contains the whole map,
	   markers included, below every piece of UI layered on top of it. */
	z-index: 0;
}

#top-left {
  position: absolute;
  top: clamp(8px, 3vw, 12px);
  left: clamp(8px, 3vw, 12px);
  z-index: 1;
  font-size: clamp(12px, 3.6vw, 15px);
  padding-right: clamp(10px, 3.6vw, 15px);
  border-color: black;
  border: clamp(2px, 0.7vw, 3px) solid;
}

#img-pill {
  margin-right: 5px;
  width: clamp(20px, 6vw, 25px);
  height: clamp(20px, 6vw, 25px);
}

#top-left2 {
  position: absolute;
  top: clamp(44px, 14vw, 60px);
  left: clamp(8px, 3vw, 12px);
  z-index: 1;
  font-size: clamp(12px, 3.6vw, 15px);
  border-color: black;
  border: clamp(2px, 0.7vw, 3px) solid;
}

#top-left3 {
  position: absolute;
  top: clamp(72px, 24vw, 100px);
  left: clamp(8px, 3vw, 12px);
  z-index: 1;
  font-size: clamp(8px, 2.4vw, 10px);
  border: clamp(2px, 0.7vw, 3px) solid;
  padding: clamp(3px, 1.2vw, 5px);
}

#right-stack {
  position: absolute;
  top: clamp(8px, 3vw, 12px);
  right: clamp(8px, 3vw, 12px);
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: clamp(10px, 3vw, 16px);
}

#top-right {
  padding: clamp(8px, 3.4vw, 14px);
  line-height: 1.6;
  text-align: left;
  border: clamp(2px, 1vw, 4px) solid;
}

.time_left_from_trip {
  font-size: clamp(20px, 7vw, 30px);
  text-align: left;
}

.map-btn {
  z-index: 1;
  width: clamp(46px, 14vw, 60px);
  height: clamp(46px, 14vw, 60px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(18px, 5.6vw, 24px);
  color: var(--zt-yellow-pale);
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  border-radius: var(--zt-radius);
  box-shadow: var(--zt-shadow);
  cursor: pointer;
}

/* The map buttons slide open from the hamburger button. */
.map-tools {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: clamp(10px, 3vw, 16px);
  opacity: 0;
  transform: translateY(-12px);
  pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.map-tools.open {
	opacity: 1;
	transform: translateY(0);
	pointer-events: auto;
}

/* Card internals (#CenterInfo, .stop-*, .stamp-*) live in MissionInfoCard.vue. */

#demo-controls {
  position: absolute;
  top: clamp(100px, 32vw, 140px);
  left: clamp(8px, 3vw, 12px);
  z-index: 1;
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  padding: clamp(8px, 3vw, 12px) clamp(10px, 3.8vw, 16px);
}

.demo-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.demo-row+.demo-row {
	margin-top: 8px;
}

.demo-label {
  color: var(--zt-yellow-pale);
  font-size: clamp(0.65rem, 2.4vw, 0.75rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 4px;
  min-width: clamp(80px, 26vw, 110px);
}

.map-backdrop {
	position: fixed;
	inset: 0;
	z-index: 1;
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	background: rgba(0, 0, 0, 0.3);
}

#MapPop {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  box-shadow: var(--zt-shadow);
  padding: clamp(8px, 3vw, 12px) clamp(10px, 3.8vw, 16px);
}

/* ── Mission wiring ── */
.map-btn.active {
	color: var(--zt-black);
	background: var(--zt-yellow);
}

.map-btn:disabled {
	opacity: 0.45;
	cursor: default;
}

/* Countdown urgency: amber under 90 minutes, red (pulsing) under 45. */
#top-right.amber {
	background: var(--zt-orange) !important;
}

#top-right.red {
	background: #e5243b !important;
	color: #fff !important;
	animation: ttg-alarm 1.2s infinite;
}

@keyframes ttg-alarm {
	0% {
		box-shadow: 0 0 0 0 rgba(229, 36, 59, 0.7);
	}

	70%,
	100% {
		box-shadow: 0 0 0 16px rgba(229, 36, 59, 0);
	}
}

.time_back_from_trip {
	font-size: clamp(0.7rem, 2.6vw, 0.8rem);
}

/* Stop/stamp detail styles and @keyframes stamp-ready live in MissionInfoCard.vue. */

.demo-hint { color: var(--zt-yellow-pale); opacity: 0.7; font-size: clamp(0.62rem, 2.2vw, 0.7rem); margin-top: 8px; }

#HelpPop {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  width: min(340px, 90vw);
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  box-shadow: var(--zt-shadow);
  padding: clamp(10px, 4vw, 16px);
}
#HelpPop .btn-warning { color: var(--zt-black); font-weight: 700; text-align: left; }
#HelpPop .btn-outline-warning { text-align: left; }
.help-note { color: var(--zt-yellow-pale); opacity: 0.75; font-size: clamp(0.65rem, 2.4vw, 0.75rem); margin-bottom: 10px; }

/* ── Bottom nav (own copy — edit freely, this only affects the 3D map view) ── */
.map-nav {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: max(12px, env(safe-area-inset-bottom));
  width: min(520px, calc(100% - 24px));
  height: var(--zt-nav-h);
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr; /* one column per tab, like the shared AppNav */
  border-radius: 26px;
  box-shadow: var(--zt-shadow);
  z-index: 1030;
}
.map-nav a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: var(--zt-ink);
  text-decoration: none;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 18px;
  margin: 6px;
  border: 2px solid transparent;
  background: none;
  padding: 0;
  cursor: pointer;
}
.map-nav a i { font-size: 1.3rem; line-height: 1; }
/* Six tabs: tighten spacing and labels on narrow phones so "Passport" still fits. */
@media (max-width: 440px) {
  .map-nav a { margin: 6px 2px; font-size: 0.58rem; letter-spacing: 0.01em; }
  .map-nav a i { font-size: 1.15rem; }
}
.map-nav a.router-link-active { color: #111; background: var(--zt-yellow); border-color: var(--zt-line); }

/* Simple circular pill, floating above the nav bar instead of sitting in it. */
.map-nav-fab {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(max(12px, env(safe-area-inset-bottom)) + var(--zt-nav-h) + 14px);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  color: var(--zt-yellow-pale);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  z-index: 1031;
}

/* Next-stop card pop in/out, driven by the floating flag button below. */
.mission-pop-enter-active { animation: mission-pop-bounce 0.42s cubic-bezier(0.34, 1.56, 0.64, 1); }
.mission-pop-leave-active { animation: mission-pop-bounce 0.2s ease reverse forwards; }
@keyframes mission-pop-bounce {
  from { opacity: 0; transform: translate(-50%, 28px) scale(0.9); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}

/* The flag button's own fade/scale — same technique as mission-pop above, tuned
   smaller and quicker since it's a small button, not a whole card. Runs on the
   same showMissionCard flip as mission-pop, so the button shrinking away and the
   card bouncing in (or the reverse) happen at the same time. */
.fab-pop-enter-active { animation: fab-pop-bounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fab-pop-leave-active { animation: fab-pop-bounce 0.18s ease reverse forwards; }
@keyframes fab-pop-bounce {
  from { opacity: 0; transform: translate(-50%, 10px) scale(0.6); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
</style>

<!-- Map markers are created by MapLibre outside this component, so their styles can't be scoped. -->
<style>
.zt-stop-marker {
  width: clamp(26px, 8vw, 34px);
  height: clamp(26px, 8vw, 34px);
  border-radius: 50%;
  border: clamp(2px, 0.9vw, 3px) solid #111;
  background: #fff4c2;
  color: #111;
  font-weight: 800;
  font-size: clamp(0.78rem, 2.8vw, 0.95rem);
  display: grid;
  place-items: center;
  box-shadow: 3px 3px 0 #111;
  cursor: pointer;
  padding: 0;
}
.zt-stop-marker.next { background: #f83878; color: #fff; width: clamp(32px, 10vw, 42px); height: clamp(32px, 10vw, 42px); font-size: clamp(0.92rem, 3.2vw, 1.1rem); z-index: 2; animation: zt-marker-pulse 1.4s infinite; }
.zt-stop-marker.done { background: #111; color: #ffcc00; border-color: #ffcc00; box-shadow: none; }
@keyframes zt-marker-pulse { 0% { box-shadow: 3px 3px 0 #111, 0 0 0 0 rgba(248, 56, 120, 0.7); } 70%, 100% { box-shadow: 3px 3px 0 #111, 0 0 0 16px rgba(248, 56, 120, 0); } }

.zt-player-marker { position: relative; width: clamp(30px, 10vw, 40px); height: clamp(30px, 10vw, 40px); pointer-events: none; }
.zt-player-marker .core {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: #ffcc00;
  border: clamp(2px, 0.9vw, 3px) solid #111;
  color: #111;
  display: grid;
  place-items: center;
  font-size: clamp(0.8rem, 2.8vw, 1rem);
}

.zt-player-marker .pulse {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	background: rgba(255, 204, 0, 0.45);
	animation: zt-player-pulse 1.8s ease-out infinite;
}

.psi-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid #111; margin-left: 2px; }
.psi-good { background: #2e9e5b; }
.psi-moderate { background: #f5f5f5; }   /* white dot with a dark ring reads on yellow */
.psi-unhealthy { background: #e07a1f; }
.psi-very-unhealthy, .psi-hazardous { background: #d6322e; }

@keyframes zt-player-pulse {
	from {
		transform: scale(0.8);
		opacity: 1;
	}

	to {
		transform: scale(2.2);
		opacity: 0;
	}
}
</style>
