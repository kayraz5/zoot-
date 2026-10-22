<script setup>
import { computed } from 'vue'
import { formatTime } from '../../model/services/hours.js'

/**
 * Pick ONE run of consecutive stops by tapping them.
 * Used by the host (which stops to open) and the guest (which of the open stops to join).
 * The selection can never have holes: 1→3, 3→5 or a single stop, never "1, 2 and 4".
 *
 * v-model: { from, to } as 1-based positions in `stops`.
 */
const props = defineProps({
  stops: { type: Array, required: true }, // [{ name, area?, arrive_iso, depart_iso }]
  modelValue: { type: Object, required: true },
  minFrom: { type: Number, default: null }, // first position that may be picked (earlier ones start before I'm out)
  maxTo: { type: Number, default: null }, // last position that may be picked (e.g. later ones end too late)
  insideLabel: { type: String, default: '' },
  outsideLabel: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const n = computed(() => props.stops.length)
const low = computed(() => Math.max(1, props.minFrom ?? 1))
const limit = computed(() => Math.min(n.value, props.maxTo ?? n.value))
const locked = (i) => i < low.value || i > limit.value
const from = computed(() => props.modelValue.from)
const to = computed(() => props.modelValue.to)

function set(f, t) {
  f = Math.max(low.value, Math.min(f, limit.value))
  t = Math.max(f, Math.min(t, limit.value))
  emit('update:modelValue', { from: f, to: t })
}
/** Tap outside the range to extend it; tap an end to shrink it; tap the middle to keep just that stop. */
function tap(i) {
  if (locked(i)) return
  if (i < from.value) return set(i, to.value)
  if (i > to.value) return set(from.value, i)
  if (from.value === to.value) return
  if (i === from.value) return set(from.value + 1, to.value)
  if (i === to.value) return set(from.value, to.value - 1)
  set(i, i)
}
</script>

<template>
  <div class="srp">
    <div v-if="from !== low || to !== limit" class="d-flex justify-content-end mb-2">
      <button type="button" class="btn btn-link btn-sm p-0 text-nowrap" @click="set(low, limit)">
        {{ low === 1 && limit === n ? 'All stops' : 'All that fit' }}
      </button>
    </div>
    <ol class="stop-list">
      <li v-for="(s, idx) in stops" :key="s.place_id || idx">
        <button type="button" class="stop" :class="{ in: idx + 1 >= from && idx + 1 <= to, locked: locked(idx + 1) }"
          :aria-pressed="idx + 1 >= from && idx + 1 <= to" :disabled="locked(idx + 1)" @click="tap(idx + 1)">
          <span class="num">{{ idx + 1 }}</span>
          <span class="flex-grow-1 text-start min-w-0">
            <span class="d-block fw-800 text-truncate">{{ s.name }}</span>
            <span class="tiny mono">{{ formatTime(s.arrive_iso) }}–{{ formatTime(s.depart_iso) }}<template v-if="s.area"> · {{ s.area }}</template></span>
          </span>
          <span class="tag tiny">
            <template v-if="idx + 1 > limit"><i class="bi bi-airplane"></i> too late</template>
            <template v-else-if="idx + 1 < low"><i class="bi bi-clock"></i> too early</template>
            <template v-else-if="idx + 1 >= from && idx + 1 <= to">{{ insideLabel }}</template>
            <template v-else>{{ outsideLabel }}</template>
          </span>
        </button>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.stop-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.stop { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; border: 2px dashed var(--zt-soft-line); background: transparent; color: var(--zt-muted); }
.stop.in { border: 2px solid var(--zt-line); background: var(--zt-yellow-pale); color: #111; }
.stop.locked { opacity: 0.55; }
.stop .num { width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 800; border: 2px solid currentColor; }
.stop.in .num { background: var(--zt-yellow); border-color: #111; }
.stop .tag { flex: none; font-weight: 700; }
.min-w-0 { min-width: 0; }
</style>
