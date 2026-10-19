<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const el = ref(null)
let map = null      

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

onUnmounted(() => map?.remove())
</script>

<template>
  <div ref="el" class="quest-map"></div>
  
  <div class=""></div>


</template>

<style scoped>
.quest-map {
  position: absolute;
  inset: 0;
}
</style>
