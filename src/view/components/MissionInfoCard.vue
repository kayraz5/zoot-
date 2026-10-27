<script setup>
import { computed } from 'vue'
import { placeStampUrl } from '../../model/services/stampArt.js'
// Social quests: "With Mei until 15:40", Go solo (renders nothing when not in a quest).
import QuestCoopChip from './QuestCoopChip.vue'

/**
 * Next-stop card ("center console") shown at the bottom of the map.
 *
 * Purely presentational: the map view computes mission/GPS values (it needs them
 * for drawing too) and passes them in as props. Actions are emitted as events, so
 * the map view remains the single owner of navigation and map state.
 */
const props = defineProps({
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
  formatDistance: { type: Function, required: true } // metres -> "120 m" / "1.2 km"
})

defineEmits(['plan', 'open-passport', 'stamp', 'change-map-style', 'need-help', 'close'])

// The next place's pre-generated stamp art, matched by PNG filename. Null for the
// return leg or a place without art — the generic stamp icon is the fallback.
const stampArt = computed(() => placeStampUrl(props.next?.name))
</script>

<template>
  <div id="CenterInfo" class="rounded-4">
    <!-- This is the only way to hide the card now that the old nav-bar toggle button
         is gone while the card's open (see 3D_Map.vue) — without it there'd be no way
         back to the floating flag button. -->
    <button type="button" class="card-close" aria-label="Hide next-stop card" @click="$emit('close')">
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>

    <!-- me-4 keeps it clear of the close button above -->
    <QuestCoopChip class="me-4" />

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
          <template v-if="next.kind !== 'visit'">Head home &middot; </template>
          <span class="bi" :class="modeIcon[liveTravel?.mode || next.travel_mode]"></span> {{ liveTravel?.minutes ?? next.travel_min }} min
          <template v-if="next.kind === 'visit'"> &middot; Stay {{ next.stay_min }} min</template>
        </div>
        <div class="stop-title">{{ next.name }}</div>
        <div class="stop-dist">
          <template v-if="distance != null">{{ formatDistance(distance) }} &middot; </template>
          <span v-if="lateBy == null" class="muted">locating you…</span>
          <span v-else-if="lateBy > 0" class="behind">{{ lateBy }} min behind plan</span>
          <span v-else class="ontime">on time</span>
        </div>
        <div v-if="guidance" class="stop-guide"><i class="bi" :class="guidance.icon"></i> {{ guidance.text }}</div>
        <!-- "868 m away. Get within 80 m" repeats the distance above; GPS / in-range messages still show. -->
        <div v-if="check?.code !== 'far'" class="stop-near">{{ check?.message }}</div>
      </div>
      <div class="col-5 col-sm-4 d-flex justify-content-end">
        <button class="stamp-btn" :class="{ ready: check?.ok }" :disabled="stamping" @click="$emit('stamp')"
          :aria-label="next.kind === 'return' ? 'Check in back home' : `Stamp ${next.name}`">
          <span class="stamp-circle" :class="{ 'has-art': stampArt }">
            <img v-if="stampArt" :src="stampArt" alt="" class="stamp-art" />
            <i v-else class="bi" :class="next.kind === 'return' ? 'bi-house-check-fill' : 'bi-patch-check-fill'"></i>
          </span>
          <span class="stamp-label">{{ stamping ? '…' : next.kind === 'return' ? "I'm back" : 'Stamp' }}</span>
        </button>
      </div>

      <div class="d-flex flex-wrap card-actions">
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
/* Text and button sizes use container queries (cqw = % of this card's rendered
   width) rather than vw. On a 320–430px phone, a vw-based clamp stays pinned to its
   floor, so the card looked identical on every device; sizing against the card
   itself scales properly within its 300–600px range. */
#CenterInfo {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  /* Dock above the bottom nav instead of overlapping it: the nav's own inset +
     its height + a shared breathing gap, so the card and the nav read as two
     separate surfaces. The old 70–100px clamp sat inside the 80px nav. */
  bottom: calc(var(--zt-nav-inset) + var(--zt-nav-h) + var(--zt-nav-clearance));
  max-width: 600px;
  width: 90%;
  z-index: 1;
  text-align: left;
  background: var(--zt-black);
  border: clamp(2px, 1vw, 4px) solid var(--zt-yellow);
  box-shadow: var(--zt-shadow);
  padding: clamp(12px, 4vw, 18px) clamp(14px, 4.6vw, 20px);
  container-type: inline-size;
}

.card-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: none;
  color: var(--zt-yellow-pale);
  opacity: 0.6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
}
.card-close:hover,
.card-close:active { opacity: 1; }

.stop-meta {
  color: var(--zt-yellow-pale);
  opacity: 0.7;
  font-size: clamp(0.65rem, 3.5cqw, 0.9rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stop-title {
  color: var(--zt-yellow-pale);
  font-size: clamp(1.15rem, 6.1cqw, 1.6rem);
  font-weight: 800;
  margin: 2px 0;
}

.stop-dist {
  font-size: clamp(0.75rem, 4cqw, 1.05rem);
  color: var(--zt-yellow-pale);
}

.stop-dist .behind {
  color: var(--zt-orange);
  font-weight: 700;
}

.stop-dist .ontime { color: #5fd38d; font-weight: 700; }
.stop-dist .muted { opacity: 0.7; }

.stop-near {
  font-size: clamp(0.7rem, 3.7cqw, 1rem);
  color: var(--zt-yellow-pale);
  opacity: 0.7;
  margin-top: 6px;
}

.stop-guide {
  margin-top: 6px;
  color: var(--zt-yellow);
  font-size: clamp(0.78rem, 4.2cqw, 1.1rem);
  font-weight: 700;
}
.stop-guide .bi { margin-right: 4px; }

.stamp-btn {
  width: clamp(72px, 24cqw, 100px);
  height: clamp(72px, 24cqw, 100px);
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
  width: clamp(32px, 10cqw, 42px);
  height: clamp(32px, 10cqw, 42px);
  border-radius: 50%;
  background: var(--zt-yellow-pale);
  color: var(--zt-black);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(16px, 4.8cqw, 20px);
}

/* The location's own stamp art replaces the generic icon inside the button. */
.stamp-circle.has-art,
.stamp-btn.ready .stamp-circle.has-art { background: transparent; }
.stamp-circle .stamp-art { width: 100%; height: 100%; object-fit: contain; }

.stamp-label {
  color: var(--zt-yellow-pale);
  font-size: clamp(0.6rem, 3.2cqw, 0.85rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Both action buttons share one sizing rule so they always match height; without
   `width: fit-content`, "Need help?" wraps and becomes taller than "Change Map". */
.card-actions {
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

#ChangeMap,
#NeedHelp {
  text-align: left;
  width: fit-content;
  white-space: nowrap;
  border-radius: 13px;
  margin: 0;
}

#ChangeMap { color: black; }
#NeedHelp { color: white; }
</style>
