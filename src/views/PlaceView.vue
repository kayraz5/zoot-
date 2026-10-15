<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PlaceArt from '../components/PlaceArt.vue'
import { loadCatalog, placeById } from '../lib/catalog.js'
import { summarizePlace } from '../lib/groq.js'
import { hoursLabel } from '../lib/hours.js'
import { checkInStatus } from '../lib/checkin.js'
import { geo, hasFix, startGps } from '../lib/geo.js'
import { tick } from '../lib/clock.js'
import { useMissionStore } from '../stores/mission.js'
import { usePassportStore } from '../stores/passport.js'
import { useUserStore } from '../stores/user.js'
import { useUiStore } from '../stores/ui.js'

/** Place story, AI summary and stamp button (Hulbert: content + Groq summary). */
const route = useRoute()
const mission = useMissionStore()
const passport = usePassportStore()
const user = useUserStore()
const ui = useUiStore()
const summary = ref(null)
const busy = ref(false)
const bookmarks = ref(readBookmarks())

const place = computed(() => placeById.value.get(route.params.id))
const leg = computed(() => mission.mission?.legs.find((l) => l.place_id === route.params.id && l.status === 'pending'))
const stamped = computed(() => passport.stampedIds.has(route.params.id))
const check = computed(() => {
  tick.value
  return place.value ? checkInStatus({ place: place.value, position: hasFix() ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } : null, fake: geo.fake }) : null
})
const cost = computed(() => ['Free', '$', '$$', '$$$'][place.value?.cost_band ?? 1])
const mapsUrl = computed(() => place.value && `https://www.google.com/maps/search/?api=1&query=${place.value.lat},${place.value.lng}`)
const bookmarked = computed(() => bookmarks.value.includes(route.params.id))

async function load() {
  await loadCatalog()
  if (!place.value) return
  passport.markSeen([place.value.id])
  summary.value = null
  summary.value = await summarizePlace(place.value)
}
onMounted(() => {
  load()
  if (!geo.fake) startGps()
})
watch(() => route.params.id, load)

async function stamp() {
  busy.value = true
  try {
    if (leg.value) await mission.stamp(leg.value)
    else await mission.stampPlaceDirect(place.value, 40)
  } catch (err) {
    ui.toast(err.message, 'warning', 4500)
  } finally {
    busy.value = false
  }
}

function toggleBookmark() {
  const id = route.params.id
  bookmarks.value = bookmarked.value ? bookmarks.value.filter((b) => b !== id) : [...bookmarks.value, id]
  try { localStorage.setItem('zoot.bookmarks', JSON.stringify(bookmarks.value)) } catch {}
}
function readBookmarks() {
  try { return JSON.parse(localStorage.getItem('zoot.bookmarks')) || [] } catch { return [] }
}
</script>

<template>
  <main class="zt-page">
    <div v-if="!place" class="text-center py-5 text-muted">Place not found. <RouterLink to="/codex">Browse the Codex</RouterLink></div>
    <template v-else>
      <div class="d-flex justify-content-between mb-2">
        <button class="btn btn-link px-0" @click="$router.back()"><i class="bi bi-arrow-left"></i> Back</button>
        <button class="btn btn-soft btn-sm" @click="toggleBookmark" :aria-pressed="bookmarked">
          <i class="bi" :class="bookmarked ? 'bi-bookmark-fill' : 'bi-bookmark'"></i> {{ bookmarked ? 'Saved' : 'Save' }}
        </button>
      </div>
      <PlaceArt :place="place" :height="220" />
      <div class="mt-3 d-flex justify-content-between align-items-start gap-3">
        <div>
          <h1 class="title mb-2">{{ place.name }}</h1>
          <div class="d-flex flex-wrap gap-1">
            <span v-for="t in place.tags" :key="t" class="zt-pill">{{ t }}</span>
          </div>
        </div>
        <span v-if="stamped" class="stamped-badge" title="In your passport"><i class="bi bi-patch-check-fill"></i></span>
      </div>

      <div class="facts zt-card p-3 mt-3">
        <div><i class="bi bi-clock"></i><span>{{ hoursLabel(place) }}</span></div>
        <div><i class="bi bi-hourglass"></i><span>Plan ~{{ place.duration_min }} min</span></div>
        <div><i class="bi bi-cash-coin"></i><span>{{ cost }}</span></div>
        <div><i class="bi" :class="place.indoor ? 'bi-house' : 'bi-sun'"></i><span>{{ place.indoor ? 'Indoor / sheltered' : 'Outdoor, weather matters' }}</span></div>
        <div><i class="bi bi-train-front"></i><span>Nearest MRT: {{ place.mrt }}</span></div>
      </div>

      <section class="zt-card p-3 mt-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <b><i class="bi bi-stars"></i> Quick take</b>
          <span v-if="summary" class="zt-pill" :class="summary.source === 'groq' ? 'ink' : 'paper'">{{ summary.source === 'groq' ? 'AI summary · Groq' : 'Curated' }}</span>
        </div>
        <div v-if="!summary" class="placeholder-glow"><span class="placeholder col-12"></span><span class="placeholder col-9"></span></div>
        <template v-else>
          <p class="mb-2">{{ summary.summary }}</p>
          <ul v-if="summary.tips?.length" class="small text-muted mb-0 ps-3">
            <li v-for="t in summary.tips" :key="t">{{ t }}</li>
          </ul>
        </template>
      </section>

      <section v-if="place.captions?.length" class="mt-3">
        <div class="zt-section-title"><i class="bi bi-chat-quote"></i> Traveller notes</div>
        <div class="d-grid gap-2">
          <blockquote v-for="c in place.captions" :key="c" class="zt-card p-3 mb-0 small">“{{ c }}”</blockquote>
        </div>
        <p class="tiny text-muted mt-2">Curated notes stored with the place. Short-video embeds are a Phase P2 slot.</p>
      </section>

      <div v-if="place.safety_notes" class="alert alert-warning mt-3 small mb-0"><i class="bi bi-shield-exclamation"></i> {{ place.safety_notes }}</div>

      <section class="zt-card p-3 mt-3 d-flex align-items-center gap-3">
        <div class="flex-grow-1 small">
          <b v-if="leg">Stop {{ leg.seq }} on your quest · +{{ leg.xp }} XP</b>
          <b v-else>Off-quest stamp · +40 XP</b>
          <div class="text-muted">{{ user.isAuthed ? check?.message : 'Sign in to collect stamps.' }}</div>
        </div>
        <button class="btn btn-pop" :disabled="!user.isAuthed || !check?.ok || busy" @click="stamp"><i class="bi bi-patch-check"></i> Stamp</button>
      </section>

      <a :href="mapsUrl" target="_blank" rel="noopener" class="btn btn-link mt-2 px-0"><i class="bi bi-box-arrow-up-right"></i> Open in Google Maps</a>
    </template>
  </main>
</template>

<style scoped>
.title { font-size: 2.4rem; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px 16px; font-size: 0.86rem; font-weight: 500; }
.facts div { display: flex; gap: 10px; align-items: center; }
.facts i { width: 30px; height: 30px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--zt-yellow); color: #111; border: 2px solid var(--zt-line); font-size: 0.9rem; }
.stamped-badge { width: 52px; height: 52px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 1.5rem; background: #111; color: var(--zt-yellow); border: var(--zt-bw) solid var(--zt-line); transform: rotate(-10deg); box-shadow: var(--zt-shadow-sm); }
blockquote { font-weight: 500; box-shadow: var(--zt-shadow-sm); }
</style>
