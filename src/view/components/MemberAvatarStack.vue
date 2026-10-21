<script setup>
import { computed } from 'vue'
import UserAvatar from './UserAvatar.vue'

/** Overlapping member avatars + dashed empty seats up to the group size. Tap one to preview the profile. */
const props = defineProps({
  members: { type: Array, default: () => [] }, // quest_roster rows (host first)
  capacity: { type: Number, default: 0 },
  size: { type: Number, default: 34 },
  interactive: { type: Boolean, default: true }
})
const emit = defineEmits(['select'])
const empty = computed(() => Math.max(0, props.capacity - props.members.length))
</script>

<template>
  <div class="stack" :aria-label="`${members.length} of ${capacity || members.length} travellers`">
    <component :is="interactive ? 'button' : 'span'" v-for="m in members" :key="m.user_id" class="seat" :type="interactive ? 'button' : undefined"
      :aria-label="interactive ? `View ${m.display_name}'s profile` : undefined" @click="interactive && emit('select', m)">
      <UserAvatar :profile="m" :size="size" />
      <i v-if="m.role === 'host'" class="bi bi-star-fill crown" aria-hidden="true"></i>
    </component>
    <span v-for="n in empty" :key="'e' + n" class="seat empty" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true">
      <i class="bi bi-plus"></i>
    </span>
  </div>
</template>

<style scoped>
.stack { display: flex; align-items: center; }
.seat { position: relative; margin-left: -8px; padding: 0; border: 0; background: none; border-radius: 32%; }
.seat:first-child { margin-left: 0; }
button.seat:focus-visible { outline: 3px solid var(--zt-pink); outline-offset: 2px; }
.empty { display: inline-grid; place-items: center; border: 2px dashed var(--zt-muted); color: var(--zt-muted); background: var(--zt-card); }
.crown { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); color: var(--zt-yellow); font-size: 0.7rem; -webkit-text-stroke: 1px #111; }
</style>
