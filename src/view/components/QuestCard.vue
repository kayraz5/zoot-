<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MemberAvatarStack from './MemberAvatarStack.vue'
import { STYLES } from '../../model/data/origins.js'
import { formatTime } from '../../model/services/hours.js'

/**
 * One open window in the feed. `fit` is stopsFit() for the WHOLE window against my layover
 * (null when I have no plan yet). Guests can still join part of a window that doesn't fully fit.
 */
const props = defineProps({
  quest: { type: Object, required: true },
  fit: { type: Object, default: null },
  mine: { type: Boolean, default: false }
})
const host = computed(() => props.quest.roster?.find((m) => m.role === 'host'))
const style = computed(() => STYLES[props.quest.style])
const stops = computed(() => props.quest.stops || [])
const spots = computed(() => props.quest.capacity - (props.quest.roster?.length || 0))
const areas = computed(() => [...new Set(stops.value.map((s) => s.area).filter(Boolean))].join(' · '))
</script>

<template>
  <RouterLink :to="`/quests/${quest.id}`" class="quest-card zt-card text-reset text-decoration-none">
    <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
      <div class="tiny text-muted fw-800 mono">
        {{ formatTime(quest.starts_at) }}–{{ formatTime(quest.ends_at) }} · {{ stops.length }} stop{{ stops.length === 1 ? '' : 's' }}
      </div>
      <span v-if="mine" class="zt-pill pink">Yours</span>
      <span v-else-if="quest.status === 'full'" class="zt-pill paper">Full</span>
      <span v-else class="zt-pill pale">{{ spots }} spot{{ spots === 1 ? '' : 's' }} left</span>
    </div>
    <h2 class="h5 mb-1">{{ quest.title }}</h2>
    <div class="small text-muted mb-2 text-truncate"><i class="bi bi-geo-alt-fill"></i> {{ stops.map((s) => s.name).join(' → ') }}</div>

    <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
      <div class="d-flex align-items-center gap-2">
        <MemberAvatarStack :members="quest.roster || []" :capacity="quest.capacity" :size="30" :interactive="false" />
        <span class="small">with <b>{{ host?.display_name || 'a traveller' }}</b></span>
      </div>
      <span v-if="areas" class="tiny text-muted text-truncate">{{ areas }}</span>
    </div>

    <div v-if="(fit && !mine) || style" class="d-flex flex-wrap gap-2 mt-2">
      <span v-if="fit && !mine" class="zt-pill" :class="fit.ok ? 'fit-ok' : 'fit-no'">
        <i class="bi" :class="fit.ok ? 'bi-check-circle-fill' : 'bi-airplane'"></i> {{ fit.reason }}
      </span>
      <span v-if="style" class="zt-pill paper"><i class="bi" :class="style.icon"></i> {{ style.label }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.quest-card { display: block; padding: 14px 16px; box-shadow: var(--zt-shadow-sm); transition: transform 0.1s; }
.quest-card:active { transform: translateY(2px); }
.fit-ok { background: #5fd38d; color: #111; }
.fit-no { background: var(--zt-card); color: var(--zt-muted); }
</style>
