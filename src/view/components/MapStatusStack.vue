<script setup>
import WeatherChip from './WeatherChip.vue'

// Top-left column of the map HUD: Singapore badge, weather chip, GPS/demo button and
// (via the slot) the Demo-Walk panel, all in one flex column so every gap is the same.
defineProps({ demo: { type: Boolean, default: false } })
defineEmits(['toggle-demo'])

const LOGO_SRC = '/brand/zoot-badge-192.png' // served from public/ at runtime (kept out of the template so unit tests don't try to import it)
</script>

<template>
  <div class="status-stack">
    <div class="status-badge zt-hud-chip badge rounded-pill text-bg-warning">
      <img class="status-logo" :src="LOGO_SRC" alt="" width="25" height="25">
      Singapore
    </div>

    <!-- Weather chip and GPS button share one grid column, so they are always the same width -->
    <div class="status-col">
      <div class="status-weather"><WeatherChip /></div>
      <button type="button" class="status-demo zt-hud-chip btn btn-warning rounded-pill"
              :class="{ 'demo-on': demo }" @click="$emit('toggle-demo')">
        {{ demo ? 'Use Real GPS' : 'Enable Demo-Walk' }}
      </button>
    </div>

    <slot /> <!-- the Demo-Walk panel -->
  </div>
</template>

<style scoped>
.status-stack {
  position: absolute;
  top: clamp(8px, 3vw, 12px);
  left: clamp(8px, 3vw, 12px);
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: clamp(6px, 2vw, 10px); /* the one gap between every chip / panel */
}

.status-badge { font-size: clamp(12px, 3.6vw, 15px); padding-right: clamp(10px, 3.6vw, 15px); }
.status-logo { margin-right: 5px; width: clamp(20px, 6vw, 25px); height: clamp(20px, 6vw, 25px); }

.status-col { display: grid; grid-template-columns: max-content; gap: clamp(6px, 2vw, 10px); }
.status-weather:empty { display: none; } /* the chip renders nothing until the forecast loads */

/* Weather chip + GPS button: same height and font size, content centred */
.status-weather :deep(.wx),
.status-demo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: clamp(36px, 11vw, 44px);
  padding-top: 0;
  padding-bottom: 0;
  font-size: clamp(12px, 3.6vw, 15px);
  line-height: 1;
  text-transform: none; /* the global .btn style upper-cases; show the label as typed */
  letter-spacing: normal;
}
.status-weather :deep(.wx) { box-shadow: none; }
.status-weather :deep(.item) { font-size: inherit; }
.status-weather :deep(.item .bi) { font-size: 1.1em; }
.status-weather :deep(.item .face) { width: 1.2em; height: 1.2em; font-size: 1.2em; }

/* Demo-Walk on: the demo panel's dark background, yellow text */
.status-demo.demo-on { background-color: var(--zt-black) !important; color: var(--zt-yellow); }
</style>
