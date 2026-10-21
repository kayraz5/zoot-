<script setup>
import { computed } from 'vue'
import { formatTime } from '../../model/services/hours.js'

/**
 * Pick ONE run of consecutive stops: two handles (from / to) plus tap-to-adjust on the list.
 * Used by the host (which stops to open) and the guest (which of the open stops to join).
 * The selection can never have holes: 1→3, 3→5 or a single stop, never "1, 2 and 4".
 *
 * v-model: { from, to } as 1-based positions in `stops`.
 */
const props = defineProps({
  stops: { type: Array, required: true }, // [{ name, area?, arrive_iso, depart_iso }]
  modelValue: { type: Object, required: true },
  maxTo: { type: Number, default: null }, // last position that may be picked (e.g. later ones end too late)
  insideLabel: { type: String, default: '' },
  outsideLabel: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const n = computed(() => props.stops.length)
const limit = computed(() => Math.min(n.value, props.maxTo ?? n.value))
const from = computed(() => props.modelValue.from)
const to = computed(() => props.modelValue.to)

function set(f, t) {
  f = Math.max(1, Math.min(f, limit.value))
  t = Math.max(f, Math.min(t, limit.value))
  emit('update:modelValue', { from: f, to: t })
}
// The two handles can't cross: dragging one past the other drags it along.
function onFrom(e) {
  const v = Number(e.target.value)
  set(v, Math.max(v, to.value))
}
function onTo(e) {
  const v = Number(e.target.value)
  set(Math.min(from.value, v), v)
}
/** Tap outside the range to extend it; tap an end to shrink it; tap the middle to keep just that stop. */
function tap(i) {
  if (i > limit.value) return
  if (i < from.value) return set(i, to.value)
  if (i > to.value) return set(from.value, i)
  if (from.value === to.value) return
  if (i === from.value) return set(from.value + 1, to.value)
  if (i === to.value) return set(from.value, to.value - 1)
  set(i, i)
}

const pct = (i) => (n.value <= 1 ? 0 : ((i - 1) / (n.value - 1)) * 100)
const summary = computed(() => {
  const a = props.stops[from.value - 1]
  const b = props.stops[to.value - 1]
  if (!a || !b) return ''
  const count = to.value - from.value + 1
  return `${count === n.value ? 'All ' + n.value + ' stops' : count === 1 ? `Stop ${from.value}` : `Stops ${from.value}–${to.value}`} · ${formatTime(a.arrive_iso)}–${formatTime(b.depart_iso)}`
})
</script>

<template>
  <div class="srp">
    <div class="d-flex justify-content-between align-items-center mb-2 gap-2">
      <b class="small">{{ summary }}</b>
      <button v-if="from !== 1 || to !== limit" type="button" class="btn btn-link btn-sm p-0 text-nowrap" @click="set(1, limit)">
        {{ limit === n ? 'All stops' : 'All that fit' }}
      </button>
    </div>

    <!-- Two handles on one track (hidden when there's only one stop). -->
    <div v-if="n > 1" class="track-wrap" :style="{ '--a': pct(from) + '%', '--b': pct(to) + '%', '--lim': pct(limit) + '%' }">
      <div class="track"><div class="fill"></div><div v-if="limit < n" class="blocked"></div></div>
      <span v-for="i in n" :key="i" class="tick" :class="{ on: i >= from && i <= to }" :style="{ left: pct(i) + '%' }"></span>
      <input type="range" class="handle" min="1" :max="n" step="1" :value="from" @input="onFrom" aria-label="From stop"
        :aria-valuetext="`From stop ${from}: ${stops[from - 1]?.name}`" />
      <input type="range" class="handle" min="1" :max="n" step="1" :value="to" @input="onTo" aria-label="To stop"
        :aria-valuetext="`To stop ${to}: ${stops[to - 1]?.name}`" />
    </div>

    <ol class="stop-list">
      <li v-for="(s, idx) in stops" :key="s.place_id || idx">
        <button type="button" class="stop" :class="{ in: idx + 1 >= from && idx + 1 <= to, locked: idx + 1 > limit }"
          :aria-pressed="idx + 1 >= from && idx + 1 <= to" :disabled="idx + 1 > limit" @click="tap(idx + 1)">
          <span class="num">{{ idx + 1 }}</span>
          <span class="flex-grow-1 text-start min-w-0">
            <span class="d-block fw-800 text-truncate">{{ s.name }}</span>
            <span class="tiny mono">{{ formatTime(s.arrive_iso) }}–{{ formatTime(s.depart_iso) }}<template v-if="s.area"> · {{ s.area }}</template></span>
          </span>
          <span class="tag tiny">
            <template v-if="idx + 1 > limit"><i class="bi bi-airplane"></i> too late</template>
            <template v-else-if="idx + 1 >= from && idx + 1 <= to">{{ insideLabel }}</template>
            <template v-else>{{ outsideLabel }}</template>
          </span>
        </button>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.track-wrap { position: relative; height: 36px; margin: 0 14px 10px; }
.track { position: absolute; left: 0; right: 0; top: 15px; height: 6px; border-radius: 99px; background: var(--zt-soft-line); }
.fill { position: absolute; top: 0; bottom: 0; left: var(--a); right: calc(100% - var(--b)); background: var(--zt-pink); border-radius: 99px; }
.blocked { position: absolute; top: 0; bottom: 0; left: var(--lim); right: 0; background: repeating-linear-gradient(45deg, transparent 0 4px, var(--zt-muted) 4px 6px); opacity: 0.5; }
.tick { position: absolute; top: 13px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--zt-card); border: 2px solid var(--zt-muted); pointer-events: none; }
.tick.on { background: var(--zt-pink); border-color: var(--zt-line); }
/* Two native range inputs stacked; only their thumbs take pointer events, so both are draggable. */
.handle { position: absolute; left: -14px; right: -14px; width: calc(100% + 28px); top: 0; height: 36px; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
.handle::-webkit-slider-runnable-track { background: none; }
.handle::-moz-range-track { background: none; }
.handle::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 28px; height: 28px; border-radius: 50%; background: var(--zt-yellow); border: 3px solid var(--zt-line); box-shadow: 0 3px 0 var(--zt-shadow-color); cursor: grab; }
.handle::-moz-range-thumb { pointer-events: auto; width: 22px; height: 22px; border-radius: 50%; background: var(--zt-yellow); border: 3px solid var(--zt-line); cursor: grab; }
.handle:focus-visible::-webkit-slider-thumb { outline: 3px solid var(--zt-pink); outline-offset: 2px; }

.stop-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.stop { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; border: 2px dashed var(--zt-soft-line); background: transparent; color: var(--zt-muted); }
.stop.in { border: 2px solid var(--zt-line); background: var(--zt-yellow-pale); color: #111; }
.stop.locked { opacity: 0.55; }
.stop .num { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 800; border: 2px solid currentColor; }
.stop.in .num { background: var(--zt-yellow); border-color: #111; }
.stop .tag { flex: none; font-weight: 700; }
.min-w-0 { min-width: 0; }
</style>
