<script setup>
import { computed, ref, watch } from 'vue'
import { usePassportStore } from '../../model/stores/passport.js'
import snapshot from '../../model/data/sgEntrySnapshot.js'
import {
  entryStatus, icaLink, countryName, VFTF, VFTF_VISA_COUNTRIES, ICA_VFTF_PAGE, ICA_ARRIVAL_CARD_PAGE
} from '../../model/services/immigration.js'

// "Can I leave Changi?" for the traveller's passport, on the profile page.
// Asks /api/entry-rule (live ICA list + Passport Index); falls back to the saved snapshot.
const passport = usePassportStore()

const countries = [...new Set(['SG', ...Object.keys(snapshot.index.rules)])]
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

const result = ref(null) // { status, link, checkedOn, live }
const loading = ref(false)

function fromSnapshot(code) {
  const icaSlugs = snapshot.ica.slugs
  return { status: entryStatus(code, { icaSlugs, indexRule: snapshot.index.rules[code] }), link: icaLink(code, icaSlugs), checkedOn: snapshot.ica.checkedOn, live: false }
}

async function check(code) {
  result.value = null
  if (!code) return
  loading.value = true
  try {
    const res = await fetch(`/api/entry-rule?passport=${code}`)
    if (!res.ok) throw new Error(`entry-rule ${res.status}`)
    result.value = await res.json()
  } catch (err) {
    console.warn('[entry-check] using the saved rules:', err.message)
    result.value = fromSnapshot(code)
  } finally {
    loading.value = false
  }
}
watch(() => passport.nationality, check, { immediate: true })

// India's transit facility also needs a visa for one of the VFTF countries, so ask before answering
const status = computed(() => {
  const s = result.value?.status
  if (s !== 'vftf-visa') return s
  if (passport.transitVisa === true) return 'vftf'
  if (passport.transitVisa === false) return 'visa'
  return 'ask'
})

const canLeave = computed(() => ['free', 'vftf', 'home'].includes(status.value))
const checkedOn = computed(() => result.value && new Date(result.value.checkedOn).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }))
</script>

<template>
  <section class="zt-card p-3 mt-3 entry">
    <div class="small fw-800 mb-2"><i class="bi bi-passport"></i> Can I leave Changi?</div>
    <label class="tiny text-muted d-block mb-1" for="entry-country">Passport country</label>
    <select id="entry-country" class="form-select form-select-sm mb-2" :value="passport.nationality || ''" @change="passport.setNationality($event.target.value)">
      <option value="" disabled>Choose your passport</option>
      <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.name }}</option>
    </select>

    <p v-if="!passport.nationality" class="small text-muted mb-0">Pick the passport you're travelling on to see if you can explore Singapore on your layover.</p>
    <p v-else-if="loading" class="small text-muted mb-0">Checking ICA's rules…</p>

    <template v-else-if="result">
      <div v-if="status === 'home'" class="verdict ok"><i class="bi bi-house-heart-fill"></i> Welcome home. You don't need a visa.</div>

      <template v-else-if="status === 'ask'">
        <div class="verdict maybe"><i class="bi bi-question-circle-fill"></i> You may be able to leave with the 96-hour Visa Free Transit Facility.</div>
        <p class="small mb-2">Do you hold a valid visa or long-term pass (valid at least a month) for {{ VFTF_VISA_COUNTRIES.join(', ') }}?</p>
        <div class="d-flex gap-2">
          <button class="btn btn-soft btn-sm" @click="passport.setTransitVisa(true)">Yes</button>
          <button class="btn btn-soft btn-sm" @click="passport.setTransitVisa(false)">No</button>
        </div>
      </template>

      <template v-else-if="canLeave">
        <div class="verdict ok"><i class="bi bi-check-circle-fill"></i>
          {{ status === 'vftf' ? 'You can leave the airport with the 96-hour Visa Free Transit Facility.' : 'You can leave the airport on your layover.' }}
        </div>
        <ul class="small mb-0 ps-3">
          <li>Passport valid for at least 6 more months, and your onward ticket.</li>
          <li v-if="status === 'vftf'">The onward flight must leave within 96 hours{{ VFTF.withVisa.includes(passport.nationality) ? ', and bring the visa or pass for the country you said' : '' }}. <a :href="ICA_VFTF_PAGE" target="_blank" rel="noopener">ICA's transit rules</a></li>
          <li>Submit the free <a :href="ICA_ARRIVAL_CARD_PAGE" target="_blank" rel="noopener">SG Arrival Card</a> within 3 days before you land. Only ICA's site and the MyICA app are official.</li>
          <li>Allow about 30 minutes for immigration each way.</li>
        </ul>
        <button v-if="status === 'vftf' && VFTF.withVisa.includes(passport.nationality)" class="btn btn-link btn-sm px-0" @click="passport.setTransitVisa(null)">Change my visa answer</button>
      </template>

      <template v-else-if="status === 'visa'">
        <div class="verdict stop"><i class="bi bi-x-circle-fill"></i> You need a Singapore visa to leave the airport.</div>
        <p class="small mb-1">Without one, stay in Changi's transit area: there's plenty to do airside, and you won't need to clear immigration.</p>
        <p class="small mb-0"><a :href="result.link" target="_blank" rel="noopener">How to get a visa (ICA)</a></p>
        <button v-if="VFTF.withVisa.includes(passport.nationality)" class="btn btn-link btn-sm px-0" @click="passport.setTransitVisa(null)">Change my visa answer</button>
      </template>

      <div v-else-if="status === 'none'" class="verdict stop"><i class="bi bi-x-circle-fill"></i> Singapore doesn't admit holders of this passport. Stay airside.</div>

      <p class="tiny text-muted mt-2 mb-0">
        ICA officers decide at the border, so check <a :href="result.link" target="_blank" rel="noopener">ICA's page for your passport</a> before you fly.
        Rules checked {{ checkedOn }}{{ result.live ? '' : ' (saved copy)' }}.
      </p>
    </template>
  </section>
</template>

<style scoped>
.verdict { display: flex; gap: 8px; align-items: flex-start; font-weight: 800; margin-bottom: 8px; padding: 10px 12px; border-radius: 14px; border: 2px solid var(--zt-line); }
.verdict i { font-size: 1.1rem; line-height: 1.2; }
.verdict.ok { background: #d7f5dd; color: #11461c; }
.verdict.maybe { background: var(--zt-yellow-pale); color: #111; }
.verdict.stop { background: #ffd9de; color: #5b0d18; }
.entry a { font-weight: 700; }
</style>
