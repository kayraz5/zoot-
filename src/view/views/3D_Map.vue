<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre resolves its worker next to its own module, which Vite never copies into the build.
// Importing it with ?url makes Vite emit it as an asset and gives us the real URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(maplibreWorkerUrl)
import axios from 'axios'
import destination from '@turf/destination'
import { point } from '@turf/helpers'
import AppNav from '../components/AppNav.vue'
import { useMissionStore } from '../../model/stores/mission.js'
import { useUiStore } from '../../model/stores/ui.js'
import { loadCatalog } from '../../model/services/catalog.js'
import { geo, startGps, setFake, teleport, hasFix } from '../../model/services/geo.js'
import { checkInStatus } from '../../model/services/checkin.js'
import { travel, distanceM } from '../../model/services/travel.js'
import { formatTime } from '../../model/services/hours.js'
import { tick } from '../../model/services/clock.js'
import { getWalkRoute } from '../../model/services/walkRoute.js'
import { addQuestLayers, setQuestColors, setRoute, setFence, syncStopMarkers, createPlayerMarker, straight } from '../map/questLayers.js'
import { describePsi } from '../../model/services/weather.js'
import { removePlaceMarker } from '../components/placeMarker.js'
import { PinLayer } from '../gl/pinPoint.js'

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdiZWU2YWY0OGY3NDQ4NjA5MGJiNjUwZTVkZjg5NTAwIiwiaCI6Im11cm11cjY0In0="
const el = ref(null)
let map = null
let placeMarkers = []
const weather_data = ref(null)
const MapStyle = ref(false)
const speed = ref(20)
const wasd = ref(true)
const is3D = ref(true)
const Go3D = ref(false)
const colorTheme = ref('theme')
const colorblind = ref(false)
const SideInfo = ref(false)

async function fetchRoute(start, end) {
  const URL = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}`
  const response = await axios.get(URL)
  return response.data.features[0].geometry
}
function getCurrentPosition() {
  return new Promise((resolve, reject) => { // call resolve, and if there's a value from pos, then resolve value
    navigator.geolocation.getCurrentPosition( // would be the current location cords, else will fall back into the error
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      reject
    )
  })
}

async function showRouteTo(destination) {
  const start = await getCurrentPosition()
  const geometry = await fetchRoute(start, destination)

  if (map.getSource('route')) {
    map.getSource('route').setData({ type: 'Feature', geometry, properties: {} })
  } else {
    map.addSource('route', { // registers the route's coordinates under the name "route"
      type: 'geojson',
      data: { type: 'Feature', geometry, properties: {} }
    })
    map.addLayer({ // draws the route source's data as a line, from the current position to the destination
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ff1dce', // bright purplish-pink
        'line-width': 5,
        'line-opacity': 0.9
      }
    })
  }
}

// ── Mission state ────────────────────────────────────────────────────────
const route = useRoute()
const router = useRouter()
const store = useMissionStore()

const ui = useUiStore()
const haze = computed(() => {
	if (!ui.shownHaze) return null
	return { psi: ui.shownHaze.psi, ...describePsi(ui.shownHaze.psi) }
})
const lightningNearby = computed(() => ui.shownLightning?.nearby === true)
const mapReady = ref(false)
const following = ref(true) // camera follows you until you drag the map
const stamping = ref(false)
const helpOpen = ref(false)
const liveRoute = ref(null) // street route from you to the next stop: { coords, steps, from, to }
const plannedSegments = ref([]) // street routes between the later stops
const markers = new Map()
let player = null

const HOME_RADIUS_M = 300 // "back at the airport/hotel" counts within this distance
const modeIcon = { walk: 'bi-person-walking', mrt: 'bi-train-front-fill', taxi: 'bi-taxi-front-fill' }

const demo = computed(() => geo.fake) // Demo-Walk = fake GPS you move with WASD / taps
const m = computed(() => store.mission)
const next = computed(() => store.nextLeg)
const here = computed(() => (hasFix() ? { lat: geo.lat, lng: geo.lng } : null))
const opts = computed(() => ({ maxWalk: m.value?.prefs?.maxWalk, style: m.value?.style }))

const liveTravel = computed(() => (next.value && here.value ? travel(here.value, next.value, opts.value) : null))
const distance = computed(() => (next.value && here.value ? distanceM(here.value, next.value) : null))
const stopNumber = computed(() => {
	const visits = store.visitLegs
	return next.value?.kind === 'visit' ? `${visits.indexOf(next.value) + 1}/${visits.length}` : ''
})

/** Can you stamp right now? Visits use the real check-in rules; the trip home uses a wider radius. */
const check = computed(() => {
	tick.value
	const n = next.value
	if (!n) return null
	if (n.kind === 'return') {
		if (!here.value) return { ok: false, message: 'Waiting for GPS…' }
		const d = distanceM(here.value, n)
		return d <= HOME_RADIUS_M
			? { ok: true, message: `You're back at ${n.name}. Check in to finish the quest.` }
			: { ok: false, message: `${formatDist(d)} from ${n.name}. Get within ${HOME_RADIUS_M} m to finish.` }
	}
	return checkInStatus({ place: n, position: here.value ? { ...here.value, accuracy: geo.accuracy } : null, fake: geo.fake })
})

/** Minutes you'd arrive after the planned time if you set off now (negative = early). */
const lateBy = computed(() => {
	if (!next.value || !liveTravel.value) return null
	const eta = tick.value + liveTravel.value.minutes * 60000
	return Math.round((eta - Date.parse(next.value.arrive_iso)) / 60000)
})

/** The next instruction: a street turn when walking, the MRT/taxi hop otherwise. */
const guidance = computed(() => {
	const t = liveTravel.value
	if (!t || !here.value) return null
	if (t.mode !== 'walk') return { icon: modeIcon[t.mode], text: t.detail }
	if (distance.value < 40) return { icon: 'bi-flag-fill', text: "You're there. Look around for the spot." }
	const lr = liveRoute.value
	if (!lr || lr.to !== next.value) return { icon: 'bi-person-walking', text: `Walk ${formatDist(distance.value)} to the stop` }
	const step = lr.steps.find((s, i) => i > 0 && s.text !== 'Arrive at the stop' && distanceM(here.value, s.at) > 10)
	if (!step) return { icon: 'bi-flag-fill', text: `Straight on, ${formatDist(distance.value)} to go` }
	return { icon: step.icon, text: `In ${formatDist(distanceM(here.value, step.at))}: ${step.text}` }
})

const countdown = computed(() => {
	if (!store.mustReturnMs) return null
	const s = Math.max(0, Math.floor((store.mustReturnMs - tick.value) / 1000))
	return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})
const leaveBy = computed(() => {
	tick.value
	return m.value && next.value ? store.leaveBy()?.ms ?? null : null
})
const timeLevel = computed(() => {
	const min = (store.mustReturnMs - tick.value) / 60000
	return min < 45 ? 'red' : min < 90 ? 'amber' : ''
})

function formatDist(meters) {
	if (meters == null) return ''
	return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`
}

// ── Drawing ──────────────────────────────────────────────────────────────
function drawMission() {
	if (!mapReady.value) return
	if (here.value) player.setLngLat([here.value.lng, here.value.lat]).addTo(map)
	syncStopMarkers(map, markers, store.legs, next.value, (leg) => flyTo(leg))
	drawRoute()
	drawFence()
}

function drawFence() {
	const n = next.value
	const radius = n?.kind === 'return' ? HOME_RADIUS_M : (check.value?.radius ?? 80)
	setFence(map, n, radius, !!check.value?.ok)
}

/** You → next stop (bold, live) + every later pending leg (faded). */
function drawRoute() {
	if (!mapReady.value) return
	const segs = []
	const n = next.value
	if (n) {
		const from = here.value || previousPoint(n)
		const lr = liveRoute.value
		const mode = liveTravel.value?.mode || n.travel_mode
		const coords = lr && lr.to === n && mode === 'walk' ? [[from.lng, from.lat], ...lr.coords] : straight(from, n)
		segs.push({ coords, mode, active: true })
	}
	setRoute(map, [...segs, ...plannedSegments.value])
}

/** Where the traveller was before `leg`: the leg before it, or the trip origin. */
function previousPoint(leg) {
	const legs = store.legs
	const i = legs.indexOf(leg)
	return i > 0 ? legs[i - 1] : m.value.origin
}

/** Street routes between later stops (only walking legs need the router; MRT/taxi stay straight). */
async function refreshPlanned() {
	const pending = store.legs.filter((l) => l.status === 'pending')
	const segs = []
	for (let i = 1; i < pending.length; i++) {
		const a = pending[i - 1]
		const b = pending[i]
		const r = b.travel_mode === 'walk' ? await getWalkRoute(a, b) : null
		segs.push({ coords: r ? r.coords : straight(a, b), mode: b.travel_mode, active: false })
	}
	plannedSegments.value = segs
	drawRoute()
}

let lastRouteAt = 0
let retryTimer = 0
async function refreshLiveRoute(force = false) {
	clearTimeout(retryTimer)
	const n = next.value
	if (!n || !here.value || liveTravel.value?.mode !== 'walk') {
		liveRoute.value = null
		return drawRoute()
	}
	const lr = liveRoute.value
	const moved = lr ? distanceM(lr.from, here.value) : Infinity
	if (!force && lr?.to === n && moved < 25) return drawRoute()
	// Moving fast (demo 20×): at most one router call every 3 s, but always catch up once you stop.
	const wait = 3000 - (Date.now() - lastRouteAt)
	if (!force && wait > 0) {
		retryTimer = setTimeout(() => refreshLiveRoute(), wait)
		return drawRoute()
	}
	lastRouteAt = Date.now()
	const from = { ...here.value }
	const r = await getWalkRoute(from, n)
	if (r && next.value === n) liveRoute.value = { ...r, from, to: n }
	drawRoute()
}

// ── Camera ───────────────────────────────────────────────────────────────
function flyTo(p, zoom = 17) {
	map?.flyTo({ center: [p.lng, p.lat], zoom, duration: 1200 })
	following.value = false
}

function recenter() {
	following.value = true
	if (!geo.fake) startGps()
	if (here.value) map.easeTo({ center: [here.value.lng, here.value.lat], zoom: 17, duration: 800 })
	else ui.toast('Waiting for GPS… Allow location access, or turn on Demo-Walk.', 'dark')
}

/** Fit you + every remaining stop on screen, leaving room for the stop card. */
function overview() {
	// The trip home is usually far (the airport), so leave it out unless it's the last thing left.
	const ahead = store.legs.filter((l) => l.status === 'pending')
	const pts = [here.value, ...(ahead.length > 1 ? ahead.filter((l) => l.kind === 'visit') : ahead)].filter(Boolean)
	if (!pts.length && m.value) pts.push(m.value.origin)
	if (!pts.length) return
	const lngs = pts.map((p) => p.lng)
	const lats = pts.map((p) => p.lat)
	following.value = false
	map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
		padding: { top: 140, bottom: 300, left: 60, right: 100 }, maxZoom: 16.5, duration: 1000
	})
}

// ── Stamping & help ──────────────────────────────────────────────────────
async function stampNext() {
	const n = next.value
	if (!n || stamping.value) return
	if (!check.value?.ok) return ui.toast(check.value?.message || 'Not in range yet.', 'warning', 3500)
	stamping.value = true
	try {
		if (n.kind === 'return') await store.completeReturn()
		else await store.stamp(n)
		liveRoute.value = null
	} catch (err) {
		ui.toast(err.message, 'warning', 4500)
	} finally {
		stamping.value = false
	}
}

async function replan(mode) {
	helpOpen.value = false
	await store.replan(mode)
}

async function skipNext() {
	helpOpen.value = false
	if (next.value?.kind !== 'visit') return
	await store.skip(next.value)
	ui.toast('Stop skipped. On to the next one.', 'dark')
}

// ── Demo-Walk (fake GPS) ─────────────────────────────────────────────────
function bearingDeg(a, b) {
	const r = (x) => (x * Math.PI) / 180
	const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat))
	const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng))
	return (Math.atan2(y, x) * 180) / Math.PI
}
function offsetFrom(p, bearing, meters) {
	const [lng, lat] = destination(point([p.lng, p.lat]), meters / 1000, bearing, { units: 'kilometers' }).geometry.coordinates
	return { lat, lng }
}
/** A spot `meters` short of the next stop, on the line from the previous one. */
function nearNext(meters) {
	const n = next.value
	if (!n) return m.value?.origin || null
	const prev = previousPoint(n)
	return offsetFrom(n, bearingDeg(n, prev), meters)
}

function toggleDemo() {
	if (geo.fake) {
		setFake(false)
		ui.toast('Using real GPS.', 'dark')
	} else {
		setFake(true, here.value || nearNext(200) || undefined)
		following.value = true
		ui.toast('Demo-Walk on: use WASD / arrow keys, or tap the map to move.', 'dark', 4000)
	}
}

function jumpTo(meters) {
	const p = nearNext(meters)
	if (!p) return
	if (!geo.fake) setFake(true)
	teleport(p)
	following.value = true
}

const KEY_DIRS = { w: 0, arrowup: 0, s: 180, arrowdown: 180, a: -90, arrowleft: -90, d: 90, arrowright: 90 }
const keys = new Set()
let raf = 0
let lastFrame = 0
function onKey(e) {
	if (!geo.fake || !wasd.value || e.target.closest?.('input, textarea, select')) return
	const k = e.key.toLowerCase()
	if (k in KEY_DIRS) {
		keys.add(k)
		e.preventDefault()
	}
}
const onKeyUp = (e) => keys.delete(e.key.toLowerCase())
function loop(t) {
	const dt = Math.min(100, t - (lastFrame || t))
	lastFrame = t
	if (keys.size && geo.fake && hasFix() && map) {
		let x = 0
		let y = 0
		for (const k of keys) {
			const a = ((KEY_DIRS[k] + map.getBearing()) * Math.PI) / 180
			x += Math.sin(a)
			y += Math.cos(a)
		}
		if (x || y) {
			const metersPerSec = 1.4 * speed.value // walking pace × demo speed
			teleport(offsetFrom(here.value, (Math.atan2(x, y) * 180) / Math.PI, (metersPerSec * dt) / 1000))
			following.value = true
		}
	}
	raf = requestAnimationFrame(loop)
}

// ── Reactions ────────────────────────────────────────────────────────────
watch(() => [here.value?.lat, here.value?.lng], () => {
	if (!mapReady.value || !here.value) return
	player.setLngLat([here.value.lng, here.value.lat]).addTo(map)
	if (following.value) {
		// Following always means street level, even if you'd zoomed out to see the whole quest.
		const zoom = map.getZoom() < 15.5 ? 16.8 : undefined
		if (geo.fake && !zoom) map.jumpTo({ center: [here.value.lng, here.value.lat] })
		else map.easeTo({ center: [here.value.lng, here.value.lat], zoom, duration: zoom ? 900 : 600 })
	}
	drawFence()
	refreshLiveRoute()
})

// Stamps, skips and replans change the legs: redraw everything.
watch(() => [mapReady.value, m.value?.id, store.legs.map((l) => l.seq + l.status + l.place_id).join()], () => {
	drawMission()
	refreshPlanned()
	refreshLiveRoute(true)
})

watch(check, drawFence)

let noFixTimer = 0
onMounted(async () => {
	await loadCatalog()
	await store.loadActive()
	if (!geo.fake) startGps()
	noFixTimer = setTimeout(() => {
		if (!hasFix() && m.value) ui.toast("Can't find your location. Allow location access, or tap Enable Demo-Walk to try the quest from here.", 'warning', 6000)
	}, 8000)
	window.addEventListener('keydown', onKey)
	window.addEventListener('keyup', onKeyUp)
	raf = requestAnimationFrame(loop)
})

function GoToFlat() {
	map.easeTo({
		pitch: 0,
		bearing: 0,
		duration: 600
	})
}

function GoTo3D() {
	map.easeTo({
		pitch: 56,
		bearing: -18,
		duration: 600
	})
}

function View(x) {
	if (x) {
		GoToFlat()
	}
	else {
		GoTo3D()
	}
}

function RemoveBuildings(show) {
	map.setLayoutProperty('building', 'visibility', show ? 'visible' : 'none')
	map.setLayoutProperty('building-3d', 'visibility', show ? 'visible' : 'none')
}

function applyMapColors() {
	if (!map || !map.isStyleLoaded()) return

	if (colorTheme.value === 'theme') {
		// Background + water → darker version of the Simple theme's own hue
		map.setPaintProperty('background', 'background-color', '#463320')
		map.setPaintProperty('water', 'fill-color', '#002166')

		// Buildings → darker version of the Simple theme's own hue
		map.setPaintProperty('building', 'fill-color', '#37342f')
		map.setPaintProperty('building-3d', 'fill-extrusion-color', '#37342f')

		// Every road layer → bright yellow, regardless of class
		map.getStyle().layers.forEach((layer) => {
			if (layer.id.startsWith('road_') && layer.type === 'line') {
				map.setPaintProperty(layer.id, 'line-color', '#ffcc00')
			}
		})

		// Landcover → darker version of each layer's own original hue
		const landcoverDark = {
			landcover_grass: '#2e481e',
			landcover_ice: '#273f3f',
			landcover_sand: '#5a4e0c',
			landcover_wood: '#2b5214'
		}
		map.getStyle().layers.forEach((layer) => {
			if (landcoverDark[layer.id]) {
				map.setPaintProperty(layer.id, 'fill-color', landcoverDark[layer.id])
			} else if ((layer.id.startsWith('landuse_') || layer.id === 'park') && layer.type === 'fill') {
				map.setPaintProperty(layer.id, 'fill-color', '#141414')
			}
		})
	} else {
		map.setPaintProperty('background', 'background-color', '#f8f4f0')
		map.setPaintProperty('water', 'fill-color', '#9ebdff')
		map.setPaintProperty('building', 'fill-color', '#dcd9d6')
		map.setPaintProperty('building-3d', 'fill-extrusion-color', '#dcd9d6')

		map.getStyle().layers.forEach((layer) => {
			if (layer.id.startsWith('road_') && layer.type === 'line') {
				map.setPaintProperty(layer.id, 'line-color', '#333333')
			}
		})

		const landcoverLight = {
			landcover_grass: '#b0d59a',
			landcover_ice: '#e0ecec',
			landcover_sand: '#f7efc3',
			landcover_wood: '#ace38c'
		}
		map.getStyle().layers.forEach((layer) => {
			if (landcoverLight[layer.id]) {
				map.setPaintProperty(layer.id, 'fill-color', landcoverLight[layer.id])
			} else if ((layer.id.startsWith('landuse_') || layer.id === 'park') && layer.type === 'fill') {
				map.setPaintProperty(layer.id, 'fill-color', '#f8f4f0')
			}
		})
	}
}

function ApplyColorblindMode(enabled) {
	if (!map || !map.isStyleLoaded()) return

	if (enabled) {
		map.setPaintProperty('building', 'fill-color', '#E69F00')           // orange
		map.setPaintProperty('building-3d', 'fill-extrusion-color', '#E69F00')
		map.setPaintProperty('water', 'fill-color', '#0072B2')              // blue

		map.getStyle().layers.forEach((layer) => {
			if (layer.id.startsWith('road_') && layer.type === 'line') {
				map.setPaintProperty(layer.id, 'line-color', '#F0E442')         // yellow
			}
		})

		const landcoverSafe = {
			landcover_grass: '#009E73',   // bluish-green
			landcover_wood: '#009E73',
			landcover_sand: '#E69F00',
			landcover_ice: '#56B4E9'
		}
		map.getStyle().layers.forEach((layer) => {
			if (landcoverSafe[layer.id]) {
				map.setPaintProperty(layer.id, 'fill-color', landcoverSafe[layer.id])
			}
		})
	} else {
		applyMapColors()
	}
}

onMounted(() => {
	map = new MapLibreMap({
		container: el.value,
		style: 'https://tiles.openfreemap.org/styles/liberty',
		center: [103.8198, 1.3521], // Singapore
		zoom: 16.5,
		pitch: 56,
		bearing: -18,
		maxPitch: 72,
		minZoom: 10,
		attributionControl: { compact: true },
		canvasContextAttributes: { antialias: true },
		pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
	})

	map.on('load', async () => {
		applyMapColors()
		addQuestLayers(map)
		setQuestColors(map, colorTheme.value === 'theme')
		player = createPlayerMarker(map)
		map.addLayer(new PinLayer({ id: 'mbs-pin', lng: 103.8607, lat: 1.2830 }))
		mapReady.value = true
		await store.loadActive()
		// "On map" from the mission list jumps to that stop; otherwise start on you, or on the whole quest.
		const focus = store.legs.find((l) => String(l.seq) === String(route.query.focus))
		if (focus) flyTo(focus)
		else if (here.value) map.jumpTo({ center: [here.value.lng, here.value.lat], zoom: 17 })
		else if (store.nextLeg) map.jumpTo({ center: [store.nextLeg.lng, store.nextLeg.lat], zoom: 16 })
		else overview()
	})
	// Dragging the map stops the camera from snapping back to you until you press the crosshair.
	map.on('dragstart', (e) => { if (e.originalEvent) following.value = false })
	// Demo-Walk: tap anywhere to walk there instantly.
	map.on('click', (e) => {
		if (!geo.fake) return
		teleport({ lat: e.lngLat.lat, lng: e.lngLat.lng })
	})
})

watch(colorTheme, () => {
	applyMapColors()
	if (map) setQuestColors(map, colorTheme.value === 'theme')
})

onMounted(async () => {
	ui.loadWeather(1.2897, 103.8501) // fills ui.haze and ui.lightning (it handles its own errors)
	try {
		const res = await axios.get("https://api.open-meteo.com/v1/forecast?latitude=1.2897&longitude=103.8501&current=temperature_2m,rain,uv_index")
		weather_data.value = res.data
	} catch (err) {
		console.error(err)
	}
})

onUnmounted(() => {
	cancelAnimationFrame(raf)
	clearTimeout(noFixTimer)
	clearTimeout(retryTimer)
	window.removeEventListener('keydown', onKey)
	window.removeEventListener('keyup', onKeyUp)
	markers.clear()
	placeMarkers.forEach(removePlaceMarker)
	map?.remove()
})
</script>

<template>
	<div ref="el" class="quest-map"></div>

	<div id="top-left" class="badge rounded-pill text-bg-warning">
		<img id="img-pill" src="/brand/zoot-badge-192.png" alt="" width="25" height="25">
		Singapore
	</div>

	<div id="top-left2" class="badge rounded-pill text-bg-warning">
		<span class="wx-item bi bi-sun-fill" title="Temperature">{{ weather_data?.current?.temperature_2m }}°C</span>
		<span class="wx-item bi bi-cloud-rain-heavy-fill" title="Rainfall now">{{ weather_data?.current?.rain }} mm</span>
		<span v-if="haze" class="wx-item bi bi-wind" :title="`PSI ${haze.psi} (${haze.label})`">
			{{ haze.psi }}<span class="psi-dot" :class="`psi-${haze.level}`"></span>
		</span>
		<span v-if="lightningNearby" class="wx-item bi bi-lightning-charge-fill"
			:title="`Lightning ${ui.shownLightning.nearestKm} km away`"></span>
	</div>


	<button id="top-left3" @click="toggleDemo" class="btn btn-warning rounded-pill">{{ demo ? 'Use real GPS' : 'Enable Demo - Walk' }}</button>

	<div id="top-right" class="badge rounded-4 text-bg-warning" :class="timeLevel" role="timer">
		<span class="bi-airplane-fill"> &nbsp; Time to Travel</span>
		<br>
		<div class="time_left_from_trip mono">{{ countdown || '--:--:--' }}</div>
		<div class="time_back_from_trip">{{ leaveBy ? `Head back by ${formatTime(leaveBy)}` : m ? 'Quest complete' : 'Noactive quest' }}</div>
	</div>

	<button id="TestRoute" class="btn btn-warning rounded-pill" @click="showRouteTo([103.8607, 1.2834])">Test Route (MBS)</button>

	<button id="MoreInfo" class="map-btn" type="button" @click="SideInfo = !SideInfo" aria-label="Map tools"
		title="Map tools">
		<i class="bi bi-list"></i>
	</button>

	<div class="map-tools" :class="{ open: SideInfo }">
		<button id="zoom" class="map-btn" type="button" @click="next && flyTo(next)" :disabled="!next"
			aria-label="Zoom to next stop" title="Zoom to next stop">
			<i class="bi bi-zoom-in"></i>
		</button>

		<button id="outlook" class="map-btn" type="button" @click="overview" aria-label="Show whole quest"
			title="Show whole quest">
			<i class="bi bi-arrows-fullscreen"></i>
		</button>

		<button id="RealGps" class="map-btn" :class="{ active: following }" type="button" @click="recenter"
			aria-label="Follow my location" title="Follow my location">
			<i class="bi bi-crosshair"></i>
		</button>

		<button id="TopView" class="map-btn" type="button" v-on:click="Go3D = !Go3D, View(Go3D)"
			aria-label="Toggle top-down view" title="Toggle top-down view">
			<i class="bi-map"></i>
		</button>
	</div>

	<div id="CenterInfo" class="rounded-4">
		<!-- No quest yet -->
		<div v-if="!m" class="row align-items-center">
			<div class="col-12">
				<div class="stop-meta">No active quest</div>
				<div class="stop-title">Plan a layover first</div>
				<div class="stop-near">Your stops, route and stamps show up here once you build a quest.</div>
				<button class="btn btn-warning btn-sm mt-3" @click="router.push('/plan')"><i class="bi bi-magic"></i>
					Plan a layover</button>
			</div>
		</div>

		<!-- Every stop done and back home -->
		<div v-else-if="!next" class="row align-items-center">
			<div class="col-12">
				<div class="stop-meta">Quest complete &middot; {{ store.stampedCount }}/{{ store.visitLegs.length }}
					stamped</div>
				<div class="stop-title">{{ m.title }}</div>
				<div class="stop-near">Nice run. Your chops are in the passport.</div>
				<button class="btn btn-warning btn-sm mt-3" @click="router.push('/passport')"><i class="bi bi-book"></i>
					Open passport</button>
			</div>
		</div>

		<!-- Heading to a stop (or home) -->
		<div v-else class="row align-items-center">
			<div class="col-7 col-sm-8">
				<div class="stop-meta">
					<template v-if="next.kind === 'visit'">Next stop {{ stopNumber }} &middot; </template><template
						v-else>Head home &middot; </template>
					<span class="bi" :class="modeIcon[liveTravel?.mode || next.travel_mode]"></span> {{
						liveTravel?.minutes ??
						next.travel_min }} min
					<template v-if="next.kind === 'visit'"> &middot; Stay {{ next.stay_min }} min</template>
				</div>
				<div class="stop-title">{{ next.name }}</div>
				<div class="stop-dist">
					<template v-if="distance != null">{{ formatDist(distance) }} &middot; </template>
					<span v-if="lateBy == null" class="muted">locating you…</span>
					<span v-else-if="lateBy > 0" class="behind">{{ lateBy }} min behind plan</span>
					<span v-else class="ontime">on time</span>
				</div>
				<div v-if="guidance" class="stop-guide"><i class="bi" :class="guidance.icon"></i> {{ guidance.text }}
				</div>
				<div class="stop-near">{{ check?.message }}</div>
			</div>
			<div class="col-5 col-sm-4 d-flex justify-content-end">
				<button class="stamp-btn" :class="{ ready: check?.ok }" :disabled="stamping" @click="stampNext"
					:aria-label="next.kind === 'return' ? 'Check in back home' : `Stamp ${next.name}`">
					<span class="stamp-circle"><i class="bi"
							:class="next.kind === 'return' ? 'bi-house-check-fill' : 'bi-patch-check-fill'"></i></span>
					<span class="stamp-label">{{ stamping ? '…' : next.kind === 'return' ? "I'm back" : 'Stamp'
						}}</span>
				</button>
			</div>

			<div class="d-flex flex-wrap">
				<button id="ChangeMap" class="btn btn-sm bg-warning" @click="MapStyle = !MapStyle">
					<i class="bi bi-map"></i> Change Map Style
				</button>
				<button id="NeedHelp" class="btn btn-sm bg-danger" @click="helpOpen = true">
					<i class="bi bi-question-circle-fill"></i> Need help?
				</button>
			</div>
		</div>
	</div>

	<div v-if="demo" id="demo-controls" class="rounded-4">
		<div class="demo-row">
			<span class="demo-label">Speed</span>
			<button class="btn rounded-pill btn-sm" :class="speed === 1 ? 'btn-warning' : 'btn-outline-warning'"
				@click="speed = 1">1&times;</button>
			<button class="btn rounded-pill btn-sm" :class="speed === 6 ? 'btn-warning' : 'btn-outline-warning'"
				@click="speed = 6">6&times;</button>
			<button class="btn rounded-pill btn-sm" :class="speed === 20 ? 'btn-warning' : 'btn-outline-warning'"
				@click="speed = 20">20&times;</button>
		</div>
		<div class="demo-row">
			<span class="demo-label">WASD movement</span>
			<button class="btn rounded-pill btn-sm" :class="wasd === true ? 'btn-warning' : 'btn-outline-warning'"
				@click="wasd = true">Yes</button>
			<button class="btn rounded-pill btn-sm" :class="wasd === false ? 'btn-warning' : 'btn-outline-warning'"
				@click="wasd = false">No</button>
		</div>
		<div class="demo-row">
			<span class="demo-label">CheckPoint</span>
			<button class="btn rounded-pill btn-sm btn-outline-warning" :disabled="!next"
				@click="jumpTo(200)">Near</button>
			<button class="btn rounded-pill btn-sm btn-outline-warning" :disabled="!next" @click="jumpTo(25)">At
				stop</button>
		</div>
		<div class="demo-hint">Tap the map to walk there.</div>
	</div>

	<template v-if="helpOpen">
		<div class="map-backdrop" @click="helpOpen = false"></div>
		<div id="HelpPop" class="rounded-4" role="dialog" aria-label="Need help?">
			<div class="demo-label mb-2">Change the plan</div>
			<p class="help-note">Stamped stops stay. Only the stops ahead get rewritten from where you are now.</p>
			<button class="btn btn-warning btn-sm w-100 mb-2" :disabled="store.status === 'planning'"
				@click="replan('behind')"><i class="bi bi-hourglass-split"></i> I'm behind schedule</button>
			<button class="btn btn-warning btn-sm w-100 mb-2" :disabled="store.status === 'planning'"
				@click="replan('less-walking')"><i class="bi bi-person-walking"></i> Less walking</button>
			<button class="btn btn-warning btn-sm w-100 mb-2"
				:disabled="store.status === 'planning' || next?.kind !== 'visit'" @click="replan('swap')"><i
					class="bi bi-shuffle"></i> Swap this stop</button>
			<button class="btn btn-warning btn-sm w-100 mb-2" :disabled="store.status === 'planning'"
				@click="replan('rain')"><i class="bi bi-cloud-rain-heavy-fill"></i> It's raining</button>
			<button class="btn btn-outline-warning btn-sm w-100 mb-2" :disabled="next?.kind !== 'visit'"
				@click="skipNext"><i class="bi bi-skip-forward-fill"></i> Skip this stop</button>
			<button class="btn btn-outline-warning btn-sm w-100"
				@click="router.push(m ? `/mission/${m.id}` : '/plan')"><i class="bi bi-list-ol"></i> See full
				itinerary</button>
			<div v-if="store.status === 'planning'" class="help-note mt-2">{{ store.statusText || 'Replanning…' }}</div>
		</div>
	</template>

	<div v-if="MapStyle" class="map-backdrop" @click="MapStyle = false"></div>

	<div id="MapPop" class="rounded-4" v-if="MapStyle">
		<div class="demo-row">
			<span class="demo-label">3D Mode</span>
			<button class="btn rounded-pill btn-sm" :class="is3D === true ? 'btn-warning' : 'btn-outline-warning'"
				@click="is3D = true, RemoveBuildings(is3D)">On</button>
			<button class="btn rounded-pill btn-sm" :class="is3D === false ? 'btn-warning' : 'btn-outline-warning'"
				@click="is3D = false, RemoveBuildings(is3D)">Off</button>
		</div>
		<div class="demo-row">
			<span class="demo-label">Color Theme</span>
			<button class="btn rounded-pill btn-sm"
				:class="colorTheme === 'theme' ? 'btn-warning' : 'btn-outline-warning'"
				@click="colorTheme = 'theme'">Zoot</button>
			<button class="btn rounded-pill btn-sm"
				:class="colorTheme === 'simple' ? 'btn-warning' : 'btn-outline-warning'"
				@click="colorTheme = 'simple'">Simple</button>
		</div>
		<div class="demo-row">
			<span class="demo-label">Colorblind Mode</span>
			<button class="btn rounded-pill btn-sm" :class="colorblind === true ? 'btn-warning' : 'btn-outline-warning'"
				@click="colorblind = true, ApplyColorblindMode(colorblind)">On</button>
			<button class="btn rounded-pill btn-sm"
				:class="colorblind === false ? 'btn-warning' : 'btn-outline-warning'"
				@click="colorblind = false, ApplyColorblindMode(colorblind)">Off</button>
		</div>
	</div>

	<AppNav />
</template>

<style scoped>
.quest-map {
	position: absolute;
	inset: 0;
}

#top-left {
	position: absolute;
	top: 12px;
	left: 12px;
	z-index: 1;
	font-size: 15px;
	padding-right: 15px;
	border-color: black;
	border: 3px solid;
}

#img-pill {
	margin-right: 5px;
}

#top-left2 {
	position: absolute;
	top: 60px;
	left: 12px;
	z-index: 1;
	font-size: 15px;
	border-color: black;
	border: 3px solid;
	display: flex; /* lay items out in a row */
	align-items: center;
	gap: 14px; /* space between the temperature, rain, PSI and bolt */
}

/* Each item: icon and text with a small gap between them. */
.wx-item {
	display: inline-flex;
	align-items: center;
	gap: 5px;               /* space between an icon and its number */
}


#top-left3 {
	position: absolute;
	top: 100px;
	left: 12px;
	z-index: 1;
	font-size: 10px;
	border: 3px solid;
	padding: 5px;
}

#top-right {
	position: absolute;
	top: 12px;
	right: 12px;
	padding: 14px;
	line-height: 1.6;
	text-align: left;
	border: 4px solid;
}

.time_left_from_trip {
	font-size: 30px;
	text-align: left;
}

#NeedHelp {
	margin-top: 3px;
	color: black;
	max-width: fit-content;
	border-color: rgb(238, 238, 107);
	margin-left: 8px;
	margin-top: 10px;
}


.map-btn {
	position: absolute;
	z-index: 1;
	width: 60px;
	height: 60px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 24px;
	color: var(--zt-yellow-pale);
	background: var(--zt-black);
	border: 4px solid var(--zt-yellow);
	border-radius: var(--zt-radius);
	box-shadow: var(--zt-shadow);
	cursor: pointer;
}

#TestRoute {
	position: absolute;
	top: 150px;
	right: 12px;
	z-index: 1;
	color: black;
}

/* The map buttons slide open from the hamburger button. */
.map-tools {
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

#zoom {
	top: 425px;
	right: 12px;
}

#outlook {
	top: 350px;
	right: 12px;
}

#RealGps {
	top: 275px;
	right: 12px;
}

#TopView {
	top: 500px;
	right: 12px;
}

#MoreInfo {
	top: 200px;
	right: 12px;
	z-index: 1;
}

#CenterInfo {
	position: absolute;
	left: 50%;
	transform: translateX(-50%);
	bottom: 96px;
	max-width: 600px;
	width: 90%;
	z-index: 1;
	text-align: left;
	background: var(--zt-black);
	border: 4px solid var(--zt-yellow);
	box-shadow: var(--zt-shadow);
	padding: 18px 20px;
}

.stop-meta {
	color: var(--zt-yellow-pale);
	opacity: 0.7;
	font-size: 0.75rem;
	font-weight: 800;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.stop-title {
	color: var(--zt-yellow-pale);
	font-size: 1.6rem;
	font-weight: 800;
	margin: 2px 0;
}

.stop-dist {
	font-size: 0.9rem;
	color: var(--zt-yellow-pale);
}

.stop-dist .behind {
	color: var(--zt-orange);
	font-weight: 700;
}

.stop-near {
	font-size: 0.8rem;
	color: var(--zt-yellow-pale);
	opacity: 0.7;
	margin-top: 6px;
}

.stamp-btn {
	width: 100px;
	height: 100px;
	border-radius: 50%;
	border: 4px solid var(--zt-yellow);
	background: transparent;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 4px;
	cursor: pointer;
}

.stamp-circle {
	width: 42px;
	height: 42px;
	border-radius: 50%;
	background: var(--zt-yellow-pale);
	color: var(--zt-black);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
}

.stamp-label {
	color: var(--zt-yellow-pale);
	font-size: 0.7rem;
	font-weight: 800;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

#ChangeMap {
	color: black;
	text-align: left;
	width: fit-content;
	border-radius: 13px;
	margin-top: 10px;
}

#demo-controls {
	position: absolute;
	top: 140px;
	left: 12px;
	z-index: 1;
	background: var(--zt-black);
	border: 4px solid var(--zt-yellow);
	padding: 12px 16px;
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
	font-size: 0.75rem;
	font-weight: 800;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-right: 4px;
	min-width: 110px;
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
	border: 4px solid var(--zt-yellow);
	box-shadow: var(--zt-shadow);
	padding: 12px 16px;
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
	font-size: 0.8rem;
}

.stop-dist .ontime {
	color: #5fd38d;
	font-weight: 700;
}

.stop-dist .muted {
	opacity: 0.7;
}

.stop-guide {
	margin-top: 6px;
	color: var(--zt-yellow);
	font-size: 0.9rem;
	font-weight: 700;
}

.stop-guide .bi {
	margin-right: 4px;
}

.stamp-btn:disabled {
	cursor: wait;
}

.stamp-btn:not(.ready) {
	opacity: 0.55;
	border-style: dashed;
}

.stamp-btn.ready {
	background: var(--zt-yellow);
	animation: stamp-ready 1.4s infinite;
}

.stamp-btn.ready .stamp-label {
	color: var(--zt-black);
}

.stamp-btn.ready .stamp-circle {
	background: var(--zt-black);
	color: var(--zt-yellow);
}

@keyframes stamp-ready {
	0% {
		box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7);
	}

	70%,
	100% {
		box-shadow: 0 0 0 18px rgba(255, 204, 0, 0);
	}
}

.demo-hint {
	color: var(--zt-yellow-pale);
	opacity: 0.7;
	font-size: 0.7rem;
	margin-top: 8px;
}

#HelpPop {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	z-index: 2;
	width: min(340px, 90vw);
	background: var(--zt-black);
	border: 4px solid var(--zt-yellow);
	box-shadow: var(--zt-shadow);
	padding: 16px;
}

#HelpPop .btn-warning {
	color: var(--zt-black);
	font-weight: 700;
	text-align: left;
}

#HelpPop .btn-outline-warning {
	text-align: left;
}

.help-note {
	color: var(--zt-yellow-pale);
	opacity: 0.75;
	font-size: 0.75rem;
	margin-bottom: 10px;
}
</style>

<!-- Map markers are created by MapLibre outside this component, so their styles can't be scoped. -->
<style>
.zt-stop-marker {
	width: 34px;
	height: 34px;
	border-radius: 50%;
	border: 3px solid #111;
	background: #fff4c2;
	color: #111;
	font-weight: 800;
	font-size: 0.95rem;
	display: grid;
	place-items: center;
	box-shadow: 3px 3px 0 #111;
	cursor: pointer;
	padding: 0;
}

.zt-stop-marker.next {
	background: #f83878;
	color: #fff;
	width: 42px;
	height: 42px;
	font-size: 1.1rem;
	z-index: 2;
	animation: zt-marker-pulse 1.4s infinite;
}

.zt-stop-marker.done {
	background: #111;
	color: #ffcc00;
	border-color: #ffcc00;
	box-shadow: none;
}

@keyframes zt-marker-pulse {
	0% {
		box-shadow: 3px 3px 0 #111, 0 0 0 0 rgba(248, 56, 120, 0.7);
	}

	70%,
	100% {
		box-shadow: 3px 3px 0 #111, 0 0 0 16px rgba(248, 56, 120, 0);
	}
}

.zt-player-marker {
	position: relative;
	width: 40px;
	height: 40px;
	pointer-events: none;
}

.zt-player-marker .core {
	position: absolute;
	inset: 4px;
	border-radius: 50%;
	background: #ffcc00;
	border: 3px solid #111;
	color: #111;
	display: grid;
	place-items: center;
	font-size: 1rem;
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
