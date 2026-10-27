<script setup>
// The hamburger that opens the map-tools drawer. Yellow when closed, dark while open.
defineProps({ open: { type: Boolean, default: false } })
defineEmits(['toggle'])
</script>

<template>
  <div id="MoreInfo" class="map-btn menu-btn" :class="{ open }" @click="$emit('toggle')">
    <i class="bi bi-list"></i>
  </div>
</template>

<style scoped>
.map-btn.menu-btn { background: var(--zt-yellow); color: #000; border-color: #000; box-shadow: 3px 3px 0 #000; }
.map-btn.menu-btn.open { background: var(--zt-black); color: var(--zt-yellow); border-color: var(--zt-yellow); box-shadow: 3px 3px 0 var(--zt-yellow); }
</style>
