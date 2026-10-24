<script setup>
// Pulled out of 3D_Map.vue: this is the card at the bottom of the map that shows the
// mission's current status ("no quest yet" / "quest complete" / "heading to a stop").
// It's purely presentational — all the GPS/mission computed values (mission, next,
// distance, guidance, etc.) are worked out in 3D_Map.vue (it needs them for drawing
// the map too) and handed down here as props. Buttons don't act directly; they emit
// events so 3D_Map.vue stays the one place that owns navigation/map state.
defineProps({
  mission: { type: Object, default: null },       // the active mission, or null if none
  next: { type: Object, default: null },           // the stop you're heading to, or null if the quest is done
  stopNumber: { type: String, default: '' },       // e.g. "2/5"
  liveTravel: { type: Object, default: null },     // { mode, minutes, detail }
  distance: { type: Number, default: null },       // metres to `next`
  lateBy: { type: Number, default: null },         // minutes behind plan (negative = early)
  guidance: { type: Object, default: null },       // { icon, text }
  check: { type: Object, default: null },          // { ok, message } — can you stamp right now?
  stamping: { type: Boolean, default: false },     // a stamp request is in flight
  stampedCount: { type: Number, default: 0 },
  totalVisits: { type: Number, default: 0 },
  modeIcon: { type: Object, required: true },      // { walk, mrt, taxi } -> bootstrap-icon class
  formatDist: { type: Function, required: true }   // metres -> "120 m" / "1.2 km"
})

defineEmits(['plan', 'open-passport', 'stamp', 'change-map-style', 'need-help'])
</script>

<template>
  <div id="CenterInfo" class="rounded-4">
    <!-- No quest yet -->
    <div v-if="!mission" class="row align-items-center">
      <div class="col-12">
        <div class="stop-meta">No active quest</div>
        <div class="stop-title">Plan a layover first</div>
        <div class="stop-near">Your stops, route and stamps show up here once you build a quest.</div>
        <button class="btn btn-warning btn-sm mt-3" @click="$emit('plan')"><i class="bi bi-magic"></i> Plan a layover</button>
      </div>
    </div>

    <!-- Every stop done and back home -->
    <div v-else-if="!next" class="row align-items-center">
      <div class="col-12">
        <div class="stop-meta">Quest complete &middot; {{ stampedCount }}/{{ totalVisits }} stamped</div>
        <div class="stop-title">{{ mission.title }}</div>
        <div class="stop-near">Nice run. Your chops are in the passport.</div>
        <button class="btn btn-warning btn-sm mt-3" @click="$emit('open-passport')"><i class="bi bi-book"></i> Open passport</button>
      </div>
    </div>

    <!-- Heading to a stop (or home) -->
    <div v-else class="row align-items-center">
      <div class="col-7 col-sm-8">
        <div class="stop-meta">
          <template v-if="next.kind === 'visit'">Next stop {{ stopNumber }} &middot; </template><template v-else>Head home &middot; </template>
          <span class="bi" :class="modeIcon[liveTravel?.mode || next.travel_mode]"></span> {{ liveTravel?.minutes ?? next.travel_min }} min
          <template v-if="next.kind === 'visit'"> &middot; Stay {{ next.stay_min }} min</template>
        </div>
        <div class="stop-title">{{ next.name }}</div>
        <div class="stop-dist">
          <template v-if="distance != null">{{ formatDist(distance) }} &middot; </template>
          <span v-if="lateBy == null" class="muted">locating you…</span>
          <span v-else-if="lateBy > 0" class="behind">{{ lateBy }} min behind plan</span>
          <span v-else class="ontime">on time</span>
        </div>
        <div v-if="guidance" class="stop-guide"><i class="bi" :class="guidance.icon"></i> {{ guidance.text }}</div>
        <div class="stop-near">{{ check?.message }}</div>
      </div>
      <div class="col-5 col-sm-4 d-flex justify-content-end">
        <button class="stamp-btn" :class="{ ready: check?.ok }" :disabled="stamping" @click="$emit('stamp')"
          :aria-label="next.kind === 'return' ? 'Check in back home' : `Stamp ${next.name}`">
          <span class="stamp-circle"><i class="bi" :class="next.kind === 'return' ? 'bi-house-check-fill' : 'bi-patch-check-fill'"></i></span>
          <span class="stamp-label">{{ stamping ? '…' : next.kind === 'return' ? "I'm back" : 'Stamp' }}</span>
        </button>
      </div>

      <div class="d-flex flex-wrap">
        <button id="ChangeMap" class="btn btn-sm bg-warning" @click="$emit('change-map-style')">
          <i class="bi bi-map"></i> Change Map Style
        </button>
        <button id="NeedHelp" class="btn btn-sm bg-danger" @click="$emit('need-help')">
          <i class="bi bi-question-circle-fill"></i> Need help?
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
#CenterInfo {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: clamp(70px, 20vw, 100px);
  max-width: 600px;
  width: 90%;
  z-index: 1;
  text-align: left;
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  box-shadow: var(--zt-shadow);
  padding: clamp(12px, 4vw, 18px) clamp(14px, 4.6vw, 20px);
}

.stop-meta {
  color: var(--zt-yellow-pale);
  opacity: 0.7;
  font-size: clamp(0.65rem, 2.4vw, 0.75rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stop-title {
  color: var(--zt-yellow-pale);
  font-size: clamp(1.15rem, 5vw, 1.6rem);
  font-weight: 800;
  margin: 2px 0;
}

.stop-dist {
  font-size: clamp(0.75rem, 2.8vw, 0.9rem);
  color: var(--zt-yellow-pale);
}

.stop-dist .behind {
  color: var(--zt-orange);
  font-weight: 700;
}

.stop-dist .ontime { color: #5fd38d; font-weight: 700; }
.stop-dist .muted { opacity: 0.7; }

.stop-near {
  font-size: clamp(0.7rem, 2.5vw, 0.8rem);
  color: var(--zt-yellow-pale);
  opacity: 0.7;
  margin-top: 6px;
}

.stop-guide {
  margin-top: 6px;
  color: var(--zt-yellow);
  font-size: clamp(0.78rem, 2.8vw, 0.9rem);
  font-weight: 700;
}
.stop-guide .bi { margin-right: 4px; }

.stamp-btn {
  width: clamp(72px, 24vw, 100px);
  height: clamp(72px, 24vw, 100px);
  border-radius: 50%;
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}

.stamp-btn:disabled { cursor: wait; }
.stamp-btn:not(.ready) { opacity: 0.55; border-style: dashed; }
.stamp-btn.ready { background: var(--zt-yellow); animation: stamp-ready 1.4s infinite; }
.stamp-btn.ready .stamp-label { color: var(--zt-black); }
.stamp-btn.ready .stamp-circle { background: var(--zt-black); color: var(--zt-yellow); }
@keyframes stamp-ready { 0% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); } 70%, 100% { box-shadow: 0 0 0 18px rgba(255, 204, 0, 0); } }

.stamp-circle {
  width: clamp(32px, 10vw, 42px);
  height: clamp(32px, 10vw, 42px);
  border-radius: 50%;
  background: var(--zt-yellow-pale);
  color: var(--zt-black);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(16px, 4.8vw, 20px);
}

.stamp-label {
  color: var(--zt-yellow-pale);
  font-size: clamp(0.6rem, 2.2vw, 0.7rem);
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
</style>
