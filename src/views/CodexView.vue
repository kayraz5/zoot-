<script setup>
import { computed, onMounted, ref } from 'vue'
import { catalog, loadCatalog } from '../lib/catalog.js'
import { usePassportStore } from '../stores/passport.js'
import { AREAS } from '../data/origins.js'

/** City Codex: every place, seen vs stamped (the collection screen). */
const passport = usePassportStore()
const filter = ref('all')
onMounted(loadCatalog)

const groups = computed(() =>
  AREAS.map((a) => {
    const places = catalog.value.filter((p) => p.area === a.id)
    return { ...a, places, stamped: places.filter((p) => passport.stampedIds.has(p.id)).length }
  }).filter((g) => g.places.length)
)
const total = computed(() => catalog.value.length)
const stampedTotal = computed(() => catalog.value.filter((p) => passport.stampedIds.has(p.id)).length)
const seenTotal = computed(() => catalog.value.filter((p) => passport.seen.has(p.id)).length)
const state = (p) => (passport.stampedIds.has(p.id) ? 'stamped' : passport.seen.has(p.id) ? 'seen' : 'unknown')
const visible = (p) => filter.value === 'all' || state(p) === filter.value
</script>

<template>
  <main class="zt-page">
    <h1 class="title mb-1">City Codex</h1>
    <p class="text-muted small">Singapore · {{ stampedTotal }} stamped · {{ seenTotal }} seen · {{ total }} total</p>
    <div class="progress mb-3" style="height: 12px" role="progressbar" :aria-valuenow="stampedTotal" aria-valuemin="0" :aria-valuemax="total">
      <div class="progress-bar bar-stamped" :style="{ width: (stampedTotal / total) * 100 + '%' }"></div>
      <div class="progress-bar bar-seen" :style="{ width: ((seenTotal - stampedTotal) / total) * 100 + '%' }"></div>
    </div>
    <div class="d-flex gap-2 mb-3">
      <button v-for="f in ['all', 'stamped', 'seen', 'unknown']" :key="f" class="zt-chip text-capitalize" :class="{ active: filter === f }" @click="filter = f">{{ f === 'unknown' ? 'undiscovered' : f }}</button>
    </div>

    <section v-for="g in groups" :key="g.id" class="mb-3">
      <div class="zt-section-title">
        <span class="area-glyph" :style="{ color: g.ink }">{{ g.glyph }}</span> {{ g.id }}
        <span class="ms-auto tiny text-muted mono">{{ g.stamped }}/{{ g.places.length }}</span>
      </div>
      <div class="codex-grid">
        <RouterLink v-for="p in g.places.filter(visible)" :key="p.id" :to="`/place/${p.id}`" class="cell" :class="state(p)">
          <span class="icon">
            <i v-if="state(p) === 'stamped'" class="bi bi-patch-check-fill"></i>
            <i v-else-if="state(p) === 'seen'" class="bi bi-eye"></i>
            <i v-else class="bi bi-question-lg"></i>
          </span>
          <span class="name">{{ state(p) === 'unknown' ? '???' : p.name }}</span>
        </RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.title { font-size: 2.4rem; }
.area-glyph { font-size: 1.3rem; }
.codex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border-radius: 16px; border: var(--zt-bw) solid var(--zt-line); background: var(--zt-card); text-decoration: none; color: var(--zt-ink); text-align: center; }
.cell .icon { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: var(--zt-card); border: 2px solid var(--zt-line); font-size: 1.1rem; color: var(--zt-ink); }
.cell.stamped { background: var(--zt-yellow); color: #111; box-shadow: var(--zt-shadow-sm); }
.cell.stamped .icon { background: #111; color: var(--zt-yellow); border-color: #111; }
.cell.seen .icon { background: var(--zt-yellow-pale); color: #111; }
.cell.unknown { border-style: dashed; }
.cell.unknown .name { color: var(--zt-muted); letter-spacing: 0.2em; }
.cell.unknown .icon { border-style: dashed; color: var(--zt-muted); }
.name { font-size: 0.7rem; font-weight: 700; line-height: 1.15; }
.bar-stamped { background: #111; }
.bar-seen { background: var(--zt-yellow); }
[data-bs-theme='dark'] .bar-stamped { background: var(--zt-pink); }
</style>
