<script setup>
import { nextTick, ref, watch } from 'vue'
import { usePartyStore } from '../../model/stores/party.js'

/**
 * A prompt in the middle of the screen; everything behind it is blurred until the traveller answers.
 * Opened with party.ask({...}) / party.notice({...}) (e.g. "Go solo?", "Your stops with Mei are done").
 * Mounted once in App.vue.
 */
const party = usePartyStore()
const okBtn = ref(null)

watch(() => party.dialog, async (d) => {
  if (!d) return
  await nextTick()
  okBtn.value?.focus()
})
const cancel = () => party.answer(false)
</script>

<template>
  <Teleport to="body">
    <div v-if="party.dialog" class="cd-backdrop" @keydown.esc="party.dialog.cancelText ? cancel() : party.answer(true)">
      <section class="cd-card zt-card" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-body">
        <div class="cd-icon" :class="party.dialog.tone"><i class="bi" :class="party.dialog.icon"></i></div>
        <h2 id="cd-title" class="h4 mb-2">{{ party.dialog.title }}</h2>
        <p v-if="party.dialog.body" id="cd-body" class="mb-4">{{ party.dialog.body }}</p>
        <div class="d-flex gap-2">
          <button v-if="party.dialog.cancelText" type="button" class="btn btn-soft flex-grow-1" @click="cancel">{{ party.dialog.cancelText }}</button>
          <button ref="okBtn" type="button" class="btn flex-grow-1" :class="party.dialog.tone === 'danger' ? 'btn-danger' : 'btn-primary'"
            @click="party.answer(true)">{{ party.dialog.confirmText }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: cd-fade 0.15s ease-out;
}
.cd-card { width: min(380px, 100%); padding: 24px 20px 20px; text-align: center; box-shadow: var(--zt-shadow); animation: cd-pop 0.18s ease-out; }
.cd-icon { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 18px; display: grid; place-items: center; font-size: 1.6rem; background: var(--zt-pink); color: #111; border: var(--zt-bw) solid var(--zt-line); }
.cd-icon.success { background: var(--zt-yellow); }
.cd-icon.danger { background: #e5484d; color: #fff; }
@keyframes cd-fade { from { opacity: 0; } }
@keyframes cd-pop { from { transform: scale(0.94); opacity: 0; } }
</style>
