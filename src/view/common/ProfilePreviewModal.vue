<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UserAvatar from './UserAvatar.vue'
import { levelFor, titleFor } from '../../model/services/xp.js'
import { STYLES } from '../../model/data/origins.js'

/**
 * Public profile preview (what other travellers can see before questing with you).
 * Only public profile fields: no location, no contact details.
 * The `actions` slot is for things like Report / Block (added with chat).
 */
const props = defineProps({ profile: { type: Object, default: null } })
const emit = defineEmits(['close'])
const closeBtn = ref(null)

const level = computed(() => levelFor(props.profile?.xp || 0))
const style = computed(() => STYLES[props.profile?.style])

function onKey(e) { if (e.key === 'Escape') emit('close') }
watch(() => props.profile, async (p) => {
  if (p) {
    window.addEventListener('keydown', onKey)
    await nextTick()
    closeBtn.value?.focus()
  } else {
    window.removeEventListener('keydown', onKey)
  }
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="profile" class="pp-backdrop" @click.self="emit('close')">
      <div class="pp-card zt-card" role="dialog" aria-modal="true" :aria-label="`${profile.display_name}'s profile`">
        <button ref="closeBtn" type="button" class="btn btn-sm btn-soft pp-close" aria-label="Close" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
        <UserAvatar :profile="profile" :size="84" show-level class="mb-3" />
        <h2 class="h4 mb-0 d-flex align-items-center justify-content-center gap-2">
          {{ profile.display_name }}
          <i v-if="profile.is_verified" class="bi bi-patch-check-fill verified" title="Verified traveller" aria-label="Verified"></i>
        </h2>
        <div class="text-muted small mb-3">{{ titleFor(level.level) }} · {{ (profile.xp || 0).toLocaleString() }} XP</div>
        <div class="d-flex flex-wrap justify-content-center gap-2 mb-3">
          <span v-if="profile.role === 'host'" class="zt-pill pink"><i class="bi bi-star-fill"></i> Host</span>
          <span v-if="style" class="zt-pill"><i class="bi" :class="style.icon"></i> {{ style.label }}</span>
          <span v-if="profile.home_city" class="zt-pill paper"><i class="bi bi-house"></i> {{ profile.home_city }}</span>
        </div>
        <p v-if="style" class="small text-muted mb-0">{{ style.blurb }}</p>
        <div v-if="$slots.actions" class="pp-actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pp-backdrop { position: fixed; inset: 0; z-index: 1900; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; padding: 16px; }
@media (min-width: 576px) { .pp-backdrop { align-items: center; } }
.pp-card { position: relative; width: min(380px, 100%); padding: 28px 20px 22px; text-align: center; animation: pp-up 0.18s ease-out; }
@keyframes pp-up { from { transform: translateY(24px); opacity: 0; } }
.pp-close { position: absolute; top: 12px; right: 12px; }
.verified { color: var(--zt-pink); font-size: 1rem; }
.pp-actions { margin-top: 16px; padding-top: 14px; border-top: 2px dashed var(--zt-soft-line); display: flex; gap: 8px; justify-content: center; }
</style>
