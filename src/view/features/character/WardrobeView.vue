<script setup>
// ─────────────────────────────────────────────────────────────────────────────
//  WardrobeView.vue — the 3D traveller on his own, at /wardrobe
// ─────────────────────────────────────────────────────────────────────────────
//  A scratch playground for working on the character: full-page, no saving, no
//  map in the way. The quickest place to see a change after editing
//  travellerAssets.js.
//
//  The real dressing room users see is the Character tab in ProfileView — this
//  page and that tab render the SAME CharacterStudio component, so there's one
//  implementation to keep correct. The only difference is that this one throws
//  your picks away on reload; the Me tab saves them for the map.
// ─────────────────────────────────────────────────────────────────────────────
import { ref } from 'vue'
import CharacterStudio from './CharacterStudio.vue'

const outfit = ref('zoot')
const fur = ref('zoot')
const hat = ref('cap')
const eyewear = ref('none')
</script>

<template>
  <div class="wardrobe">
    <header>
      <h1>Wardrobe</h1>
      <p>
        Scratch preview — nothing here is saved. Everything is built in code, see
        <code>src/view/gl/travellerAssets.js</code>. To pick the look your map
        avatar actually wears, use the Character tab on
        <RouterLink to="/me">the Me page</RouterLink>.
      </p>
    </header>

    <CharacterStudio
      v-model:outfit="outfit"
      v-model:fur="fur"
      v-model:hat="hat"
      v-model:eyewear="eyewear"
      height="min(58dvh, 460px)" />
  </div>
</template>

<style scoped>
.wardrobe {
  min-height: 100dvh;
  padding: 1.25rem 1rem 2rem;
  background: var(--zt-bg);
  color: var(--zt-ink);
}
header h1 {
  font-family: var(--zt-font-display);
  letter-spacing: 0.02em;
  margin: 0;
}
header p {
  color: var(--zt-muted);
  font-size: 0.9rem;
  max-width: 52ch;
  margin-bottom: 1rem;
}
header code { color: var(--zt-ink); }
</style>
