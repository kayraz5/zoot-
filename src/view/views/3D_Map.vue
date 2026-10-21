<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'
import AppNav from '../components/AppNav.vue'
import { AxiosError } from 'axios'
import { createPlaceMarker, removePlaceMarker } from '../components/placeMarker.js'
import places from '../../model/data/places.sg.json'
import { PinLayer } from '../gl/pinPoint.js'

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdiZWU2YWY0OGY3NDQ4NjA5MGJiNjUwZTVkZjg5NTAwIiwiaCI6Im11cm11cjY0In0="
const el = ref(null)
let map = null
let markers = []
const weather_data = ref(null)
const MapStyle = ref(false)
const demo = ref(false)
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
  const start = await getCurrentPosition()   // ← was the hardcoded array
  const geometry = await fetchRoute(start, destination)

  if (map.getSource('route')) {
    map.getSource('route').setData({ type: 'Feature', geometry, properties: {} })
  } else {
    map.addSource('route', { //used  to register the route's coordinates under the name "route"
      type: 'geojson',
      data: { type: 'Feature', geometry, properties: {} }
    })
    map.addLayer({ // draw the route source's data as a line. From the current position to the destination
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
  else{
    GoTo3D()
  }
}

async function CenterOnMe() {
  const current2 = await getCurrentPosition();
  console.log('flying to', current2, 'current map center:', map.getCenter())
  map.flyTo({
    center: current2,
    zoom: 18,
    duration: 1500,
  })
}

function ZoomOut() {
  map.zoomTo(12, { duration: 1500 })
}

function ZoomIn() {
  map.zoomIn({ duration: 1500 })
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

  map.on('load', applyMapColors)
  map.on('load', CenterOnMe)
  map.on('load', () => {
    map.addLayer(new PinLayer({ id: 'mbs-pin', lng: 103.8607, lat: 1.2830 }))
  })

  
  onUnmounted(() => {
  markers.forEach(removePlaceMarker)
  map?.remove()
})


})

watch(colorTheme, applyMapColors)

onMounted(async () => {
  try {
    const res = await axios.get("https://api.open-meteo.com/v1/forecast?latitude=1.2897&longitude=103.8501&current=temperature_2m,rain,uv_index")
    weather_data.value = res.data
    console.log(weather_data)
  } catch (err) {
    console.error(err)
  }
})
</script>

<template>
  <div ref="el" class="quest-map"></div>

  <div id="top-left" class="badge rounded-pill text-bg-warning">
    <img id="img-pill" src="/brand/zoot-badge-192.png" alt="" width="25" height="25">
    Singapore
  </div>

  <div id="top-left2" class="badge rounded-pill text-bg-warning">
    <span class="bi bi-sun-fill">{{ weather_data?.current?.temperature_2m }}C</span>
    <span class="bi bi-cloud-rain-heavy-fill">&nbsp;{{ weather_data?.current?.rain }}</span>
  </div>

  <button id="top-left3" v-on:click="demo = !demo" class="btn btn-warning rounded-pill">Enable Demo-Walk</button>

  <div id="top-right" class="badge rounded-4 text-bg-warning">
    <span class="bi-airplane-fill"> &nbsp; Time to Travel</span>
    <br>
    <div class="time_left_from_trip">{{ }}hello</div>
    <br>
    <div class="time_back_from_trip">Head Back By{{ }}</div>
  </div>

  <button id="TestRoute" class="btn btn-warning rounded-pill" @click="showRouteTo([103.8607, 1.2834])">Test Route (MBS)</button>

  <div id="MoreInfo" class="map-btn" @click="SideInfo = !SideInfo">
    <i class="bi bi-list"></i>
  </div>

  <div class="map-tools" :class="{ open: SideInfo }">
    <div id="zoom" class="map-btn" v-on:click="ZoomIn()">
      <i class="bi bi-zoom-in"></i>
    </div>

    <div id="outlook" class="map-btn" v-on:click="ZoomOut()">
      <i class="bi bi-arrows-fullscreen"></i>
    </div>

    <div id="RealGps" class="map-btn" v-on:click="CenterOnMe()">
      <i class="bi bi-crosshair"></i>
    </div>

    <div id="TopView" class="map-btn" v-on:click="Go3D = !Go3D, View(Go3D)">
      <i class="bi-map"></i>
    </div>
  </div>

  <div id="CenterInfo" class="rounded-4">
    <div class="row align-items-center">
      <div class="col-6">
        <div class="stop-meta">NEXT STOP {{ }} &middot; <span class="bi bi-car-front-fill"></span> {{ }} &middot; STAY {{ }}</div>
        <div class="stop-title">{{ }}</div>
        <div class="stop-dist">{{ }} &middot; <span class="behind">{{ }} min behind plan</span></div>
        <div class="stop-near">{{ }} m away. Get within 80 m to stamp.</div>
      </div>
      <div class="col-6 d-flex justify-content-end">
        <button class="stamp-btn">
          <span class="stamp-circle"><i class="bi bi-patch-check-fill"></i></span>
          <span class="stamp-label">Stamp</span>
        </button>
      </div>
      
      <button id="ChangeMap" class="btn btn-sm bg-warning" @click="MapStyle = !MapStyle">
        <i class="bi bi-map"></i> Change Map Style
      </button>
      <button id="NeedHelp" class="btn btn-sm bg-danger" >
        <i class="bi bi-question-circle-fill"></i> Need help?
      </button>
    </div>
  </div>

  <div v-if="demo === true" id="demo-controls" class="rounded-4">
    <div class="demo-row">
      <span class="demo-label">Speed</span>
      <button class="btn rounded-pill btn-sm" :class="speed === 1 ? 'btn-warning' : 'btn-outline-warning'" @click="speed = 1">1x</button>
      <button class="btn rounded-pill btn-sm" :class="speed === 6 ? 'btn-warning' : 'btn-outline-warning'" @click="speed = 6">6x</button>
      <button class="btn rounded-pill btn-sm" :class="speed === 20 ? 'btn-warning' : 'btn-outline-warning'" @click="speed = 20">20x</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">WASD movement</span>
      <button class="btn rounded-pill btn-sm" :class="wasd === true ? 'btn-warning' : 'btn-outline-warning'" @click="wasd = true">Yes</button>
      <button class="btn rounded-pill btn-sm" :class="wasd === false ? 'btn-warning' : 'btn-outline-warning'" @click="wasd = false">No</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">CheckPoint</span>
      <button class="btn rounded-pill btn-sm" :class="wasd === true ? 'btn-warning' : 'btn-outline-warning'" @click="wasd = true">teleport</button>
    </div>
  </div>

  <div v-if="MapStyle" class="map-backdrop" @click="MapStyle = false"></div>

  <div id="MapPop" class="rounded-4" v-if="MapStyle">
    <div class="demo-row">
      <span class="demo-label">3D Mode</span>
      <button class="btn rounded-pill btn-sm" :class="is3D === true ? 'btn-warning' : 'btn-outline-warning'" @click="is3D = true, RemoveBuildings(is3D) ">On</button>
      <button class="btn rounded-pill btn-sm" :class="is3D === false ? 'btn-warning' : 'btn-outline-warning'" @click="is3D = false, RemoveBuildings(is3D)">Off</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">Color Theme</span>
      <button class="btn rounded-pill btn-sm" :class="colorTheme === 'theme' ? 'btn-warning' : 'btn-outline-warning'" @click="colorTheme = 'theme'">Zoot</button>
      <button class="btn rounded-pill btn-sm" :class="colorTheme === 'simple' ? 'btn-warning' : 'btn-outline-warning'" @click="colorTheme = 'simple'">Simple</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">Colorblind Mode</span>
      <button class="btn rounded-pill btn-sm" :class="colorblind === true ? 'btn-warning' : 'btn-outline-warning'" @click="colorblind = true, ApplyColorblindMode(colorblind)">On</button>
      <button class="btn rounded-pill btn-sm" :class="colorblind === false ? 'btn-warning' : 'btn-outline-warning'" @click="colorblind = false, ApplyColorblindMode(colorblind)">Off</button>
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

#TestRoute {
  position: absolute;
  top: 150px;
  right: 12px;
  z-index: 1;
  color: black;
}

.time_left_from_trip {
  font-size: 30px;
  text-align: left;
}

#NeedHelp{
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

#TopView{
  top: 500px;
  right: 12px;
}

#MoreInfo{
  top: 200px;
  right: 12px;
  z-index: 1;
}

#CenterInfo {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 100px;
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

.demo-row + .demo-row {
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
</style>
