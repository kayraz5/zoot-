<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from './view/components/AppNav.vue'
import ToastHost from './view/components/ToastHost.vue'
import StampCelebration from './view/components/StampCelebration.vue'
import RainOverlay from './view/components/RainOverlay.vue'
import { useUserStore } from './model/stores/user.js'
import { usePassportStore } from './model/stores/passport.js'
import SkyEffects from './view/components/SkyEffects.vue'
import CenterDialog from './view/components/CenterDialog.vue'

const route = useRoute()
const user = useUserStore()
const passport = usePassportStore()
const showNav = computed(() => route.meta.nav && user.isAuthed)

watch(() => user.userId, (id) => passport.load(id), { immediate: true })
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
  <AppNav v-if="showNav" />
  <SkyEffects />
  <RainOverlay />  
  <ToastHost />
  <StampCelebration />
  <CenterDialog />
</template>
