<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import axios from 'axios'
import AppNav from '../components/AppNav.vue'

const el = ref(null)
let map = null      
const weather_data = ref(null)

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

  <AppNav />

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

</style>
