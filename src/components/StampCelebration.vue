<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../stores/ui.js'
import { useUserStore } from '../stores/user.js'
import { AREAS } from '../data/origins.js'

const ui = useUiStore()
const user = useUserStore()
const router = useRouter()
const c = computed(() => ui.celebration)
const ink = computed(() => AREAS.find((a) => a.id === c.value?.area)?.ink || '#111111')
const glyph = computed(() => AREAS.find((a) => a.id === c.value?.area)?.glyph || '✦')

function close() { ui.celebrate(null) }
function toPassport() { close(); router.push('/passport') }
</script>

<template>
  <Transition name="zt-fade">
    <div v-if="c" class="celebrate" role="dialog" aria-modal="true" aria-label="Stamp collected" @click.self="close">
      <div class="card-pop zt-card text-center p-4">
        <template v-if="c.returned">
          <div class="gate-icon mb-2"><i class="bi" :class="c.onTime ? 'bi-airplane-fill' : 'bi-alarm-fill'"></i></div>
          <h2 class="zt-display title mb-1">{{ c.onTime ? 'Back with time to spare' : 'Back, a little late' }}</h2>
          <p class="text-muted mb-3">{{ c.onTime ? 'Quest complete. Enjoy the flight.' : 'You made it, but the buffer was eaten. Next time, leave earlier.' }}</p>
          <div v-if="c.xp" class="xp-burst mb-3">+{{ c.xp }} XP</div>
        </template>
        <template v-else>
          <div class="chop-stage mb-2">
            <div class="splat"></div>
            <div class="chop" :style="{ '--ink': ink }">
              <span class="glyph">{{ glyph }}</span>
              <span class="ring-text">{{ c.area }}</span>
            </div>
          </div>
          <h2 class="zt-display title mb-1">{{ c.place?.name }}</h2>
          <p class="text-muted small mb-2">Stamped · Level {{ user.level.level }} · {{ user.title }}</p>
          <div class="xp-burst mb-3">+{{ c.xp }} XP</div>
          <p v-if="c.firstInArea" class="mb-3"><span class="zt-pill pale"><i class="bi bi-journal-plus"></i> New passport page: {{ c.area }}</span></p>
        </template>
        <div class="d-flex gap-2 justify-content-center">
          <button v-if="c.firstInArea" class="btn btn-soft" @click="toPassport"><i class="bi bi-journal-bookmark-fill"></i> See chop</button>
          <button class="btn btn-primary px-4" @click="close" autofocus>Nice!</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.celebrate { position: fixed; inset: 0; z-index: 1900; display: grid; place-items: center; padding: 16px; background: rgba(17, 17, 17, 0.55); }
.card-pop { width: min(360px, 100%); box-shadow: 8px 8px 0 var(--zt-shadow-color); animation: pop 0.35s cubic-bezier(0.2, 1.6, 0.4, 1); }
@keyframes pop { from { transform: scale(0.85) rotate(-2deg); opacity: 0; } to { transform: none; opacity: 1; } }
.title { font-size: 2rem; }
.chop-stage { position: relative; height: 150px; display: grid; place-items: center; }
.chop-stage > * { grid-area: 1 / 1; }
.chop {
  width: 120px; height: 120px; border-radius: 50%; border: 6px double var(--ink); color: var(--ink);
  display: grid; place-items: center; position: relative; transform: rotate(-12deg);
  animation: slam 0.55s cubic-bezier(0.3, 0.1, 0.3, 1.5) both;
}
[data-bs-theme='dark'] .chop { background: var(--zt-yellow-pale); }
.chop .glyph { font-size: 46px; font-weight: 700; line-height: 1; font-family: var(--zt-font-head); }
.chop .ring-text { position: absolute; bottom: 14px; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.splat { width: 150px; height: 150px; border-radius: 50%; background: var(--zt-yellow); border: var(--zt-bw) solid #111; animation: splat 0.5s 0.25s ease-out both; }
@keyframes slam { 0% { transform: scale(2.6) rotate(-30deg); opacity: 0; } 60% { transform: scale(0.92) rotate(-10deg); opacity: 1; } 100% { transform: scale(1) rotate(-12deg); } }
@keyframes splat { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.xp-burst {
  display: inline-block; font-family: var(--zt-font-display); font-size: 2.2rem; line-height: 1; padding: 6px 16px 3px;
  background: var(--zt-pink); color: #111; border: var(--zt-bw) solid #111; border-radius: 14px; box-shadow: 4px 4px 0 #111; transform: rotate(-3deg);
}
.gate-icon { width: 84px; height: 84px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; font-size: 2.4rem; background: var(--zt-yellow); color: #111; border: var(--zt-bw) solid #111; }
.zt-fade-enter-active, .zt-fade-leave-active { transition: opacity 0.2s; }
.zt-fade-enter-from, .zt-fade-leave-to { opacity: 0; }
</style>
