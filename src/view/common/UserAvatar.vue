<script setup>
import { computed } from 'vue'
import { DEFAULT_COVER, onColor } from '../../model/services/brand.js'
import { levelFor } from '../../model/services/xp.js'

/** Small version of the Profile page avatar: cover colour, initial, optional level badge. */
const props = defineProps({
  profile: { type: Object, default: null },
  size: { type: Number, default: 40 },
  showLevel: { type: Boolean, default: false }
})
const cover = computed(() => props.profile?.cover_color || DEFAULT_COVER)
const initial = computed(() => (props.profile?.display_name || '?').trim().charAt(0).toUpperCase())
const level = computed(() => levelFor(props.profile?.xp || 0).level)
</script>

<template>
  <span class="ua" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.45 + 'px', background: cover, color: onColor(cover) }"
    :title="profile?.display_name" aria-hidden="true">
    {{ initial }}
    <span v-if="showLevel" class="lvl">L{{ level }}</span>
  </span>
</template>

<style scoped>
.ua {
  position: relative;
  flex: none;
  display: inline-grid;
  place-items: center;
  border-radius: 32%;
  border: 2px solid var(--zt-line);
  font-family: var(--zt-font-head);
  font-weight: 700;
  line-height: 1;
}
.lvl {
  position: absolute;
  right: -8px;
  bottom: -6px;
  background: var(--zt-pink);
  color: #111;
  font-family: inherit;
  font-size: 0.6rem;
  font-weight: 800;
  border: 1.5px solid #111;
  border-radius: 999px;
  padding: 0 5px;
}
</style>
