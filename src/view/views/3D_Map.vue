<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'
import AppNav from '../components/AppNav.vue'

const el = ref(null)
let map = null      
const weather_data = ref(null)
const MapStyle = ref(false)
const demo = ref(false)
const speed = ref(20)
const wasd = ref(true)
const is3D = ref(true)
const colorTheme = ref('theme')
const colorblind = ref(false)

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
})

onMounted(async () => {
    try {
        const res = await axios.get("https://api.open-meteo.com/v1/forecast?latitude=1.2897&longitude=103.8501&current=temperature_2m,rain,uv_index")
        weather_data.value = res.data
        console.log(weather_data)
    } catch (err) {
        console.error(err)
    }
})

onUnmounted(() => map?.remove())
</script>

<template>
  <div ref="el" class="quest-map"></div>

  <div id="top-left" class="badge rounded-pill text-bg-warning">
    <img id="img-pill"src="/brand/zoot-badge-192.png" alt="" width="25" height="25">
    Singapore
  </div>

  <div id="top-left2" class="badge rounded-pill text-bg-warning">
    <span class="bi bi-sun-fill">{{ weather_data?.current?.temperature_2m }}C</span> <span class="bi bi-cloud-rain-heavy-fill">&nbsp;{{weather_data?.current?.rain}}</span>
  </div>

  <button id="top-left3" v-on:click="demo = !demo" class="btn btn-warning rounded-pill">Enable Demo-Walk</button>

  <div id="top-right" class="badge rounded-4 text-bg-warning">
        <span class="bi-airplane-fill"> &nbsp; Time to Travel</span>
        <br>
        <div class="time_left_from_trip">{{}}hello</div> 
        <br>
        <div class="time_back_from_trip">Head Back By{{}}</div>
  </div>

  <div id="zoom" class="map-btn">
    <i class="bi bi-zoom-in"></i>
  </div>

  <div id="outlook" class="map-btn">
    <i class="bi bi-arrows-fullscreen"></i>
  </div>

  <div id="RealGps" class="map-btn">
    <i class="bi bi-crosshair"></i>
  </div>

  <div id="CenterInfo" class="rounded-4">
    <div class="row align-items-center">
        <div class="col-6">
          <div class="stop-meta">NEXT STOP {{}} &middot; <span class="bi bi-car-front-fill"></span> {{}} &middot; STAY {{ }}</div>
          <div class="stop-title">{{}}</div>
          <div class="stop-dist">{{  }} &middot; <span class="behind">{{}} min behind plan</span></div>
          <div class="stop-near">{{}} m away. Get within 80 m to stamp.</div>
        </div>
        <div class="col-6 d-flex justify-content-end">
          <button class="stamp-btn">
            <span class="stamp-circle"><i class="bi bi-patch-check-fill"></i></span>
            <span class="stamp-label">Stamp</span>
          </button>
        </div>
        <button id="ChangeMap"class="btn btn-sm bg-warning" @click="MapStyle = !MapStyle">
          <i class="bi bi-map"></i> Change Map Style
        </button>
    </div>
  </div>

  <div v-if="demo === true" id="demo-controls" class="rounded-4">
    <div class="demo-row">
      <span class="demo-label">Speed</span>
      <button class="btn rounded-pill btn-sm" :class="speed === 1 ? 'btn-warning' : 'btn-outline-warning'" @click="speed = 1">1&times;</button>
      <button class="btn rounded-pill btn-sm" :class="speed === 6 ? 'btn-warning' : 'btn-outline-warning'" @click="speed = 6">6&times;</button>
      <button class="btn rounded-pill btn-sm" :class="speed === 20 ? 'btn-warning' : 'btn-outline-warning'" @click="speed = 20">20&times;</button>
    </div>
    <div class="demo-row">
      <span class="demo-label">WASD movement</span>
      <button class="btn rounded-pill btn-sm" :class="wasd === true ? 'btn-warning' : 'btn-outline-warning'" @click="wasd = true">Yes</button>
      <button class="btn rounded-pill btn-sm" :class="wasd === false ? 'btn-warning' : 'btn-outline-warning'" @click="wasd = false">No</button>
    </div>

    </div>
    <div v-if="MapStyle" class="map-backdrop" @click="MapStyle = false"></div>
    <div id="MapPop" class="rounded-4" v-if="MapStyle">
      <div class="demo-row">
        <span class="demo-label">3D Mode</span>
        <button class="btn rounded-pill btn-sm" :class="is3D === true ? 'btn-warning' : 'btn-outline-warning'" @click="is3D = true">On</button>
        <button class="btn rounded-pill btn-sm" :class="is3D === false ? 'btn-warning' : 'btn-outline-warning'" @click="is3D = false">Off</button>
      </div>
      <div class="demo-row">
        <span class="demo-label">Color Theme</span>
        <button class="btn rounded-pill btn-sm" :class="colorTheme === 'theme' ? 'btn-warning' : 'btn-outline-warning'" @click="colorTheme = 'theme'">Follow Theme</button>
        <button class="btn rounded-pill btn-sm" :class="colorTheme === 'simple' ? 'btn-warning' : 'btn-outline-warning'" @click="colorTheme = 'simple'">Simple</button>
      </div>
      <div class="demo-row">
        <span class="demo-label">Colorblind Mode</span>
        <button class="btn rounded-pill btn-sm" :class="colorblind === true ? 'btn-warning' : 'btn-outline-warning'" @click="colorblind = true">On</button>
        <button class="btn rounded-pill btn-sm" :class="colorblind === false ? 'btn-warning' : 'btn-outline-warning'" @click="colorblind = false">Off</button>
      </div>
    </div>

  <AppNav/>

</template>

<style scoped>
.quest-map {
  position: absolute;
  inset: 0;
}

#top-left{
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1;
    font-size: 15px;
    padding-right: 15px;
    border-color: black;
    border: 3px solid;
}

#ChangeMap{
  color: black;
  text-align: left;
  width: fit-content;
  border-radius: 13px;
}

#top-left3{
    position: absolute;
    top: 100px;
    left: 12px;
    z-index: 1;
    font-size: 10px;
    border: 3px solid;
    padding: 5px;
}

#demo-controls{
    position: absolute;
    top: 140px;
    left: 12px;
    z-index: 1;
    background: var(--zt-black);
    border: 4px solid var(--zt-yellow);
    padding: 12px 16px;
}

.map-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 0.3);
}

.demo-row{
    display: flex;
    align-items: center;
    gap: 8px;
}

.demo-row + .demo-row{
    margin-top: 8px;
}

.demo-label{
    color: var(--zt-yellow-pale);
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: 4px;
    min-width: 110px;
}

#MapPop{
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

#top-right{
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 14px;
    line-height: 1.6;
    text-align: left;
    border: 4px solid;
}

.map-btn{
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

#RealGps{
    top: 200px;
    right: 12px;
}

#outlook{
    top: 275px;
    right: 12px;
}

#zoom{
    top: 350px;
    right: 12px;
}


.time_left_from_trip{
    font-size: 30px;
    text-align: left;
}

#img-pill{
    margin-right: 5px;
}

#top-left2{
    position: absolute;
    top: 60px;
    left: 12px;
    z-index: 1;
    font-size: 15px;
    border-color: black;
    border: 3px solid;
}

#CenterInfo{
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

.stop-meta{
    color: var(--zt-yellow-pale);
    opacity: 0.7;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.stop-title{
    color: var(--zt-yellow-pale);
    font-size: 1.6rem;
    font-weight: 800;
    margin: 2px 0;
}

.stop-dist{
    font-size: 0.9rem;
    color: var(--zt-yellow-pale);
}

.stop-dist .behind{
    color: var(--zt-orange);
    font-weight: 700;
}

.stop-near{
    font-size: 0.8rem;
    color: var(--zt-yellow-pale);
    opacity: 0.7;
    margin-top: 6px;
}

.stamp-btn{
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

.stamp-circle{
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

.stamp-label{
    color: var(--zt-yellow-pale);
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

</style>
