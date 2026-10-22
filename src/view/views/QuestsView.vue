<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { usePartyStore } from '../../model/stores/party.js'
import { useMissionStore } from '../../model/stores/mission.js'
import { useUserStore } from '../../model/stores/user.js'
import { stopsFit, airportBy } from '../../model/services/social.js'
import QuestCard from '../components/QuestCard.vue'

/** Open Quests feed: windows other travellers have opened, with a fit badge for my layover. */
const party = usePartyStore()
const mission = useMissionStore()
const user = useUserStore()
const onlyFits = ref(false)
const soon = ref(false)

onMounted(async () => {
  await mission.loadActive()
  party.loadOpen()
})

// A current layover to check against (an old mission whose airport time has passed doesn't count).
const hasPlan = computed(() => !!mission.mission && airportBy(mission.mission) > Date.now())
const rows = computed(() => party.open.map((q) => ({
  quest: q,
  mine: q.host_id === user.userId,
  fit: hasPlan.value ? stopsFit(q.stops, mission.mission) : null
})))
const visible = computed(() => rows.value
  .filter((r) => !onlyFits.value || r.mine || r.fit?.ok)
  .filter((r) => !soon.value || Date.parse(r.quest.starts_at) - Date.now() <= 60 * 60000)
  .sort((a, b) => Number(b.mine) - Number(a.mine)))
</script>

<template>
  <main class="zt-page">
    <header class="mb-3">
      <h1 class="mb-0" style="font-size: 2.4rem">Open quests</h1>
      <p class="text-muted small mb-0">Join someone for a stop or two. Your own return-by always comes first.</p>
    </header>

    <div v-if="!hasPlan && !party.openStatus.guest" class="alert alert-warning small d-flex gap-2 align-items-center">
      <i class="bi bi-clock-history fs-5"></i>
      <div class="flex-grow-1">Plan your layover first and we'll tell you which quests fit your flight.</div>
      <RouterLink to="/plan" class="btn btn-sm btn-primary">Plan</RouterLink>
    </div>

    <div class="filters mb-3" role="group" aria-label="Filters">
      <button v-if="hasPlan" type="button" class="zt-chip" :class="{ active: onlyFits }" :aria-pressed="onlyFits" @click="onlyFits = !onlyFits">
        <i class="bi bi-check-circle"></i> Fits my window
      </button>
      <button type="button" class="zt-chip" :class="{ active: soon }" :aria-pressed="soon" @click="soon = !soon">
        <i class="bi bi-lightning-charge"></i> Starts within 1 h
      </button>
      <RouterLink to="/mission" class="zt-chip text-decoration-none"><i class="bi bi-people-fill"></i> Open my stops</RouterLink>
    </div>

    <div v-if="party.openStatus.loading && !party.open.length" class="d-grid gap-3" aria-busy="true">
      <div v-for="n in 3" :key="n" class="skeleton zt-card"></div>
    </div>

    <div v-else-if="party.openStatus.guest" class="zt-card p-4 text-center">
      <i class="bi bi-person-lock display-5 text-muted"></i>
      <h2 class="h5 mt-2">Sign in to quest with others</h2>
      <p class="small text-muted">{{ party.openStatus.error }}</p>
      <RouterLink to="/me" class="btn btn-primary">Go to profile</RouterLink>
    </div>

    <div v-else-if="party.openStatus.error" class="zt-card p-4 text-center">
      <i class="bi bi-wifi-off display-5 text-muted"></i>
      <h2 class="h5 mt-2">Couldn't load quests</h2>
      <p class="small text-muted">{{ party.openStatus.error }}</p>
      <button class="btn btn-primary" @click="party.loadOpen()">Try again</button>
    </div>

    <div v-else-if="!visible.length" class="zt-card p-4 text-center">
      <i class="bi bi-people display-5 text-muted"></i>
      <h2 class="h5 mt-2">{{ rows.length ? 'Nothing matches' : 'No open quests right now' }}</h2>
      <p class="small text-muted mb-3">{{ rows.length ? 'Try turning a filter off.' : 'Be the first: open a few of your stops to company.' }}</p>
      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <button v-if="rows.length" class="btn btn-soft" @click="onlyFits = false; soon = false">Show all</button>
        <RouterLink to="/mission" class="btn btn-primary"><i class="bi bi-people-fill"></i> Open my stops</RouterLink>
      </div>
    </div>

    <div v-else class="d-grid gap-3">
      <QuestCard v-for="r in visible" :key="r.quest.id" :quest="r.quest" :fit="r.fit" :mine="r.mine" />
      <button class="btn btn-link btn-sm text-muted" :disabled="party.openStatus.loading" @click="party.loadOpen()">
        <i class="bi bi-arrow-clockwise"></i> {{ party.openStatus.loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters .zt-chip { white-space: nowrap; }
.skeleton { height: 150px; background: linear-gradient(100deg, var(--zt-card) 30%, var(--zt-yellow-pale) 50%, var(--zt-card) 70%); background-size: 300% 100%; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
</style>
