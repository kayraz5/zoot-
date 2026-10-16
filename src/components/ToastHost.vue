<script setup>
import { useUiStore } from '../stores/ui.js'
const ui = useUiStore()
</script>

<template>
  <div class="zt-toasts" role="status" aria-live="polite">
    <div v-for="t in ui.toasts" :key="t.id" class="zt-toast" :class="t.variant">{{ t.message }}</div>
  </div>
</template>
