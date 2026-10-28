<script setup>
import { computed } from 'vue'
import { formatTime, formatDuration } from '../../../model/services/hours.js'

/**
 * The one confirm step before joining: exactly what changes in MY plan (previewJoin's result).
 * Joined stops are added at fixed times and some own stops may be removed; nothing else moves,
 * so kept stops aren't listed.
 * A big change (2+ stops, or a 2h+ stop, removed) gets a red warning.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  preview: { type: Object, default: null }, // previewJoin(): { ok, reason, removed, kept, blocks, bigChange, fit, hostName }
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'confirm'])

const p = computed(() => props.preview)
const span = (l) => `${formatTime(l.arrive_iso)}–${formatTime(l.depart_iso)}`
const stay = (l) => Math.round((Date.parse(l.depart_iso) - Date.parse(l.arrive_iso)) / 60000)
function whyRemoved(r) {
  if (r.why === 'overlap') return 'same time as the group'
  if (r.why === 'same_place') return "you'll go with the group"
  return `only ${r.gapMin} min ${Date.parse(r.leg.arrive_iso) < Date.parse(p.value.blocks[0].arrive_iso) ? 'before' : 'after'} the group`
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && p" class="sheet-backdrop" @click.self="emit('close')">
      <section class="sheet zt-card" role="dialog" aria-modal="true" aria-labelledby="jc-title">
        <div class="grabber" aria-hidden="true"></div>
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h2 id="jc-title" class="h4 mb-0">Join {{ p.hostName }}?</h2>
            <p class="small text-muted mb-0">Here's exactly what changes in your plan.</p>
          </div>
          <button type="button" class="btn btn-sm btn-soft" aria-label="Close" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
        </div>

        <div v-if="!p.ok" class="alert alert-danger small">
          <i class="bi bi-airplane"></i> <b>{{ p.reason }}</b>
        </div>

        <template v-else>
          <div v-if="p.bigChange" class="big-warn mb-3" role="alert">
            <div class="fw-800"><i class="bi bi-exclamation-triangle-fill"></i> This replaces {{ p.removed.length === 1 ? 'a big part' : p.removed.length + ' stops' }} of your plan</div>
            <div class="small">
              Replaced: {{ p.removed.map((r) => `${r.leg.name} (${formatDuration(stay(r.leg))})`).join(', ') }}.
            </div>
          </div>

          <div class="tiny fw-800 text-uppercase text-muted mb-1">Added · with {{ p.hostName }}</div>
          <ul class="rows mb-3">
            <li v-for="b in p.blocks" :key="b.place_id" class="row-add">
              <i class="bi bi-people-fill"></i>
              <span class="flex-grow-1 min-w-0 text-truncate fw-800">{{ b.name }}</span>
              <span class="mono tiny">{{ span(b) }}</span>
            </li>
          </ul>

          <template v-if="p.removed.length">
            <div class="tiny fw-800 text-uppercase text-muted mb-1">Removed from your plan</div>
            <ul class="rows mb-3">
              <li v-for="r in p.removed" :key="r.leg.place_id" class="row-del">
                <i class="bi bi-dash-circle"></i>
                <span class="flex-grow-1 min-w-0">
                  <span class="d-block text-truncate"><s>{{ r.leg.name }}</s></span>
                  <span class="tiny">{{ whyRemoved(r) }}</span>
                </span>
                <span class="mono tiny">{{ span(r.leg) }}</span>
              </li>
            </ul>
          </template>
        </template>

        <div class="d-flex gap-2">
          <button type="button" class="btn btn-soft" :disabled="busy" @click="emit('close')">Cancel</button>
          <button type="button" class="btn btn-primary flex-grow-1" :disabled="busy || !p.ok" @click="emit('confirm')">
            <span v-if="busy" class="spinner-border spinner-border-sm"></span>
            <template v-else-if="p.ok"><i class="bi bi-people-fill"></i> Join &amp; update my plan</template>
            <template v-else>Ends too late for your flight</template>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop { position: fixed; inset: 0; z-index: 1800; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; }
.sheet {
  width: min(560px, 100%);
  max-height: 92vh;
  overflow-y: auto;
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom));
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  animation: sheet-up 0.2s ease-out;
}
@keyframes sheet-up { from { transform: translateY(40px); opacity: 0; } }
.grabber { width: 44px; height: 5px; border-radius: 99px; background: var(--zt-soft-line); margin: 0 auto 10px; }
.rows { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.rows li { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 14px; border: 2px dashed var(--zt-soft-line); }
.rows .row-add { border: 2px solid var(--zt-line); background: var(--zt-yellow-pale); color: #111; }
.rows .row-del { color: var(--zt-muted); }
.big-warn { padding: 12px 14px; border-radius: 16px; background: #e5484d; color: #fff; border: var(--zt-bw) solid var(--zt-line); }
.min-w-0 { min-width: 0; }
</style>
