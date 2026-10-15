<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from './components/AppNav.vue'
import ToastHost from './components/ToastHost.vue'
import StampCelebration from './components/StampCelebration.vue'
import { useUserStore } from './stores/user.js'
import { usePassportStore } from './stores/passport.js'

const route = useRoute()
const user = useUserStore()
const passport = usePassportStore()
const showNav = computed(() => route.meta.nav && user.isAuthed)

watch(() => user.userId, (id) => id && passport.load(id), { immediate: true })
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
  <AppNav v-if="showNav" />
  <ToastHost />
  <StampCelebration />
</template>
