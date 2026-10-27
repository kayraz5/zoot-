<script setup>
import { computed } from 'vue'
import { useUiStore } from '../../model/stores/ui.js'
import { describeCode, describePsi } from '../../model/services/weather.js'
import { tick } from '../../model/services/clock.js'
import { CITY } from '../../model/services/config.js'

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEV_RAIN_CHANCE = 90;
const DEV_RAIN_MM = 5; // fake rainfall shown when rain is forced
const MASK_ABOVE_PSI = 100; // same threshold where the haze layer starts (SkyEffects)

// Holds the forecast (ui.weather) and dev switch (ui.forceRain)
const ui = useUiStore()

const haze = computed(() => {
    if (!ui.shownHaze) return null
    const psi = ui.shownHaze.psi
    return { psi, mask: psi > MASK_ABOVE_PSI, ...describePsi(psi) }
})
const lightningNearby = computed(() => ui.shownLightning?.nearby === true)

// ---------------------------------------------------------------
// Find the forecast for the current hour
// ---------------------------------------------------------------

// Each forecast hour has a start time (h.ms) and lasts one hour
const currentHour = computed(() => {
    const hours = ui.weather?.hours; // '?.' means only continue if this exists, so we get undefined (not error) while the forecast is still loading
    if (!hours) return undefined;

    return hours.find((h) => {
        // 'tick' is the app's reactive clock, so it updates as time passes
        const startsBeforeNow = tick.value >= h.ms;
        const endsAfterNow = tick.value < h.ms + ONE_HOUR_MS;
        return startsBeforeNow && endsAfterNow;
    });
})

// ---------------------------------------------------------------
// Build the info the chip displays
// ---------------------------------------------------------------

// Returns one object: { icon, label, prob, temp, mm } / null (if there is nothing to show yet).
const RAINY_ICON = /rain|drizzle/ // icon names that mean rain

// Night in Singapore: before 07:00 or from 19:00 local time. Uses the app clock, so the dev panel's skip-time works.
const isNight = computed(() => {
    const hour = new Date(tick.value + CITY.utcOffsetMin * 60000).getUTCHours()
    return hour >= 19 || hour < 7
})
const NIGHT_ICON = { 'bi-sun': 'bi-moon-stars', 'bi-cloud-sun': 'bi-cloud-moon' } // only the sky icons have a night version

const info = computed(() => {
    const forced = ui.forceRain
    if (!ui.weather && !forced) return null // nothing loaded yet

    const current = ui.weather?.current
    // Base condition: fake heavy rain when forced, otherwise from the forecast code
    const base = forced
        ? { label: 'Heavy rain (dev)', icon: 'bi-cloud-rain-heavy' }
        : describeCode(current.code)
    const mm = forced ? DEV_RAIN_MM : (current.mm ?? 0)
    const raining = forced || mm > 0 || RAINY_ICON.test(base.icon)

    // Pick one icon: lightning wins, then rain, then the plain sky (sun / cloud-sun / cloud)
    let icon = isNight.value ? (NIGHT_ICON[base.icon] ?? base.icon) : base.icon
    if (raining && !RAINY_ICON.test(icon)) icon = 'bi-cloud-rain'
    if (lightningNearby.value) icon = raining ? 'bi-cloud-lightning-rain' : 'bi-cloud-lightning'

    return {
        icon,
        label: lightningNearby.value
            ? `${base.label}, lightning ${ui.shownLightning.nearestKm} km away`
            : base.label,
        prob: forced ? DEV_RAIN_CHANCE : (currentHour.value?.prob ?? 0), // 0 if no matching hour
        temp: current ? Math.round(current.temp) : null, // e.g. 30.4 becomes 30; null only if forced before the forecast loads
        mm
    };
});

</script>

<template>
    <div v-if="info" class="wx" :title="`${info.label}, ${info.prob}% rain chance this hour`">
        <!-- Thermometer + temperature (hidden if unknown) -->
        <span v-if="info.temp != null" class="item mono">
            <i class="bi bi-thermometer-half"></i>{{ info.temp }}°C
        </span>

        <!-- One weather icon (sun / cloud-sun / cloud / rain / lightning / both) + rainfall -->
        <span class="item mono">
            <i class="bi" :class="info.icon"></i>{{ info.mm }} mm
        </span>

        <!-- Masked face when PSI is unhealthy, smiling face when the air is fine (line icons, drawn in the chip's text colour) -->
        <span v-if="haze" class="item mono" :title="`PSI ${haze.psi} (${haze.label})`">
            <!-- Both faces share the same circle, line weight and size so they read as a pair -->
            <svg class="face" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="8" cy="8" r="7.4" />
                <template v-if="haze.mask">
                    <path d="M4.6 6.3q1 .8 2 0M9.4 6.3q1 .8 2 0" /> <!-- closed eyes -->
                    <rect x="3.2" y="8.1" width="9.6" height="4.4" rx="1.6" /> <!-- mask -->
                    <path d="M5.2 9.6h5.6M5.8 11.1h4.4" /> <!-- pleats -->
                </template>
                <template v-else>
                    <path d="M4.5 7.2q1.1-1.5 2.2 0M9.3 7.2q1.1-1.5 2.2 0" /> <!-- happy, arched eyes -->
                    <path d="M4.3 9.6q3.7 4 7.4 0" /> <!-- wide smile -->
                </template>
            </svg>{{ haze.psi }}
        </span>
    </div>
</template>


<style scoped>
.wx {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 4px 11px;
    border-radius: 999px;
    background: var(--zt-card);
    color: var(--zt-ink);
    border: var(--zt-bw) solid var(--zt-line);
    font-weight: 800;
    font-size: 0.8rem;
    box-shadow: var(--zt-shadow-sm);
}

.item .bi {
    font-size: 1rem;
}

.item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
}

.item .face { width: 1.15rem; height: 1.15rem; font-size: 1.15rem; }
</style>
